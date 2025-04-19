// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Directive } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl } from "@angular/forms";
import { firstValueFrom, lastValueFrom, debounceTime, combineLatest, BehaviorSubject } from "rxjs";

import { UserNamePipe } from "@bitwarden/angular/pipes/user-name.pipe";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { OrganizationManagementPreferencesService } from "@bitwarden/common/admin-console/abstractions/organization-management-preferences/organization-management-preferences.service";
import {
  OrganizationUserStatusType,
  OrganizationUserType,
  ProviderUserStatusType,
  ProviderUserType,
} from "@bitwarden/common/admin-console/enums";
import { ProviderUserUserDetailsResponse } from "@bitwarden/common/admin-console/models/response/provider/provider-user.response";
import { ListResponse } from "@bitwarden/common/models/response/list.response";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { ValidationService } from "@bitwarden/common/platform/abstractions/validation.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { DialogService, ToastService } from "@bitwarden/components";
import { KeyService } from "@bitwarden/key-management";

import { OrganizationUserView } from "../organizations/core/views/organization-user.view";
import { UserConfirmComponent } from "../organizations/manage/user-confirm.component";

import { PeopleTableDataSource, peopleFilter } from "./people-table-data-source";

export type StatusType = OrganizationUserStatusType | ProviderUserStatusType;
export type UserViewTypes = ProviderUserUserDetailsResponse | OrganizationUserView;

/**
 * A refactored copy of BasePeopleComponent, using the component library table and other modern features.
 * This will replace BasePeopleComponent once all subclasses have been changed over to use this class.
 */
@Directive()
export abstract class BaseMembersComponent<UserView extends UserViewTypes> {
  /**
   * Shows a banner alerting the admin that users need to be confirmed.
   */
  get showConfirmUsers(): boolean {
    return (
      this.dataSource.activeUserCount > 1 &&
      this.dataSource.confirmedUserCount > 0 &&
      this.dataSource.confirmedUserCount < 3 &&
      this.dataSource.acceptedUserCount > 0
    );
  }

  get showBulkConfirmUsers(): boolean {
    return this.dataSource.acceptedUserCount > 0;
  }

  get showBulkReinviteUsers(): boolean {
    return this.dataSource.invitedUserCount > 0;
  }

  abstract userType: typeof OrganizationUserType | typeof ProviderUserType;
  abstract userStatusType: typeof OrganizationUserStatusType | typeof ProviderUserStatusType;

  protected abstract dataSource: PeopleTableDataSource<UserView>;

  firstLoaded: boolean;

  /**
   * The currently selected status filter, or null to show all active users.
   */
  status: StatusType | null;

  /**
   * The currently executing promise - used to avoid multiple user actions executing at once.
   */
  actionPromise: Promise<void>;

  protected searchControl = new FormControl("", { nonNullable: true });
  protected statusToggle = new BehaviorSubject<StatusType | null>(null);

  constructor(
    protected apiService: ApiService,
    protected i18nService: I18nService,
    protected keyService: KeyService,
    protected validationService: ValidationService,
    private logService: LogService,
    protected userNamePipe: UserNamePipe,
    protected dialogService: DialogService,
    protected organizationManagementPreferencesService: OrganizationManagementPreferencesService,
    protected toastService: ToastService,
  ) {
    // Connect the search input and status toggles to the table dataSource filter
    combineLatest([this.searchControl.valueChanges.pipe(debounceTime(200)), this.statusToggle])
      .pipe(takeUntilDestroyed())
      .subscribe(
        ([searchText, status]) => (this.dataSource.filter = peopleFilter(searchText, status)),
      );
  }

  abstract edit(user: UserView): void;
  abstract getUsers(): Promise<ListResponse<UserView> | UserView[]>;
  abstract removeUser(id: string): Promise<void>;
  abstract reinviteUser(id: string): Promise<void>;
  abstract confirmUser(user: UserView, publicKey: Uint8Array): Promise<void>;

  async load() {
    // Load new users from the server
    const response = await this.getUsers();

    // GetUsers can return a ListResponse or an Array
    if (response instanceof ListResponse) {
      this.dataSource.data = response.data != null && response.data.length > 0 ? response.data : [];
    } else if (Array.isArray(response)) {
      this.dataSource.data = response;
    }

    this.firstLoaded = true;
  }

  invite() {
    this.edit(null);
  }

  protected async removeUserConfirmationDialog(user: UserView) {
    return this.dialogService.openSimpleDialog({
      title: this.userNamePipe.transform(user),
      content: { key: "removeUserConfirmation" },
      type: "warning",
    });
  }

  async remove(user: UserView) {
    const confirmed = await this.removeUserConfirmationDialog(user);
    if (!confirmed) {
      return false;
    }

    this.actionPromise = this.removeUser(user.id);
    try {
      await this.actionPromise;
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("removedUserId", this.userNamePipe.transform(user)),
      });
      this.dataSource.removeUser(user);
    } catch (e) {
      this.validationService.showError(e);
    }
    this.actionPromise = null;
  }

  async reinvite(user: UserView) {
    if (this.actionPromise != null) {
      return;
    }

    this.actionPromise = this.reinviteUser(user.id);
    try {
      await this.actionPromise;
      this.toastService.showToast({
        variant: "success",
        title: null,
        message: this.i18nService.t("hasBeenReinvited", this.userNamePipe.transform(user)),
      });
    } catch (e) {
      this.validationService.showError(e);
    }
    this.actionPromise = null;
  }

  async confirm(user: UserView) {
    const confirmUser = async (publicKey: Uint8Array) => {
      try {
        this.actionPromise = this.confirmUser(user, publicKey);
        await this.actionPromise;
        user.status = this.userStatusType.Confirmed;
        this.dataSource.replaceUser(user);

        this.toastService.showToast({
          variant: "success",
          title: null,
          message: this.i18nService.t("hasBeenConfirmed", this.userNamePipe.transform(user)),
        });
      } catch (e) {
        this.validationService.showError(e);
        throw e;
      } finally {
        this.actionPromise = null;
      }
    };

    if (this.actionPromise != null) {
      return;
    }

    try {
      const publicKeyResponse = await this.apiService.getUserPublicKey(user.userId);
      const publicKey = Utils.fromB64ToArray(publicKeyResponse.publicKey);

      const autoConfirm = await firstValueFrom(
        this.organizationManagementPreferencesService.autoConfirmFingerPrints.state$,
      );
      if (autoConfirm == null || !autoConfirm) {
        const dialogRef = UserConfirmComponent.open(this.dialogService, {
          data: {
            name: this.userNamePipe.transform(user),
            userId: user != null ? user.userId : null,
            publicKey: publicKey,
            confirmUser: () => confirmUser(publicKey),
          },
        });
        await lastValueFrom(dialogRef.closed);

        return;
      }

      try {
        const fingerprint = await this.keyService.getFingerprint(user.userId, publicKey);
        this.logService.info(`User's fingerprint: ${fingerprint.join("-")}`);
      } catch (e) {
        this.logService.error(e);
      }
      await confirmUser(publicKey);
    } catch (e) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorAdminConfirmUser"),
        message: e.message,
      });
      this.logService.error(`Handled exception: ${e}`);
    }
  }
}
