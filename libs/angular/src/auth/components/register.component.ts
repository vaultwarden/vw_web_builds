// FIXME: Update this file to be type safe and remove this and next line
// @ts-strict-ignore
import { Directive, EventEmitter, Input, OnInit, Output } from "@angular/core";
import { AbstractControl, UntypedFormBuilder, ValidatorFn, Validators } from "@angular/forms";
import { Router } from "@angular/router";

import { LoginStrategyServiceAbstraction, PasswordLoginCredentials } from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { AuditService } from "@bitwarden/common/abstractions/audit.service";
import { RegisterResponse } from "@bitwarden/common/auth/models/response/register.response";
import { KeysRequest } from "@bitwarden/common/models/request/keys.request";
import { ReferenceEventRequest } from "@bitwarden/common/models/request/reference-event.request";
import { RegisterRequest } from "@bitwarden/common/models/request/register.request";
import { EnvironmentService } from "@bitwarden/common/platform/abstractions/environment.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import { Utils } from "@bitwarden/common/platform/misc/utils";
import { DialogService, ToastService } from "@bitwarden/components";
import { DEFAULT_KDF_CONFIG, KeyService } from "@bitwarden/key-management";

import {
  AllValidationErrors,
  FormValidationErrorsService,
} from "../../platform/abstractions/form-validation-errors.service";
import { PasswordColorText } from "../../tools/password-strength/password-strength.component";
import { InputsFieldMatch } from "../validators/inputs-field-match.validator";

import { CaptchaProtectedComponent } from "./captcha-protected.component";

@Directive()
export class RegisterComponent extends CaptchaProtectedComponent implements OnInit {
  @Input() isInTrialFlow = false;
  @Output() createdAccount = new EventEmitter<string>();

  showPassword = false;
  formPromise: Promise<RegisterResponse>;
  referenceData: ReferenceEventRequest;
  showTerms = true;
  showErrorSummary = false;
  passwordStrengthResult: any;
  characterMinimumMessage: string;
  minimumLength = Utils.minimumPasswordLength;
  color: string;
  text: string;

  formGroup = this.formBuilder.group(
    {
      email: ["", [Validators.required, Validators.email]],
      name: [""],
      masterPassword: ["", [Validators.required, Validators.minLength(this.minimumLength)]],
      confirmMasterPassword: ["", [Validators.required, Validators.minLength(this.minimumLength)]],
      hint: [
        null,
        [
          InputsFieldMatch.validateInputsDoesntMatch(
            "masterPassword",
            this.i18nService.t("hintEqualsPassword"),
          ),
        ],
      ],
      checkForBreaches: [true],
      acceptPolicies: [false, [this.acceptPoliciesValidation()]],
    },
    {
      validator: InputsFieldMatch.validateFormInputsMatch(
        "masterPassword",
        "confirmMasterPassword",
        this.i18nService.t("masterPassDoesntMatch"),
      ),
    },
  );

  protected successRoute = "login";

  protected accountCreated = false;

  protected captchaBypassToken: string = null;

  // allows for extending classes to modify the register request before sending
  // currently used by web to add organization invitation details
  protected modifyRegisterRequest: (request: RegisterRequest) => Promise<void>;

  constructor(
    protected formValidationErrorService: FormValidationErrorsService,
    protected formBuilder: UntypedFormBuilder,
    protected loginStrategyService: LoginStrategyServiceAbstraction,
    protected router: Router,
    i18nService: I18nService,
    protected keyService: KeyService,
    protected apiService: ApiService,
    platformUtilsService: PlatformUtilsService,
    environmentService: EnvironmentService,
    protected logService: LogService,
    protected auditService: AuditService,
    protected dialogService: DialogService,
    protected toastService: ToastService,
  ) {
    super(environmentService, i18nService, platformUtilsService, toastService);
    this.showTerms = !platformUtilsService.isSelfHost();
    this.characterMinimumMessage = this.i18nService.t("characterMinimum", this.minimumLength);
  }

  async ngOnInit() {
    // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.setupCaptcha();
  }

  async submit(showToast = true) {
    if (typeof crypto.subtle === "undefined") {
      this.platformUtilsService.showToast(
        "error",
        "This browser requires HTTPS to use the web vault",
        "Check the Vaultwarden wiki for details on how to enable it",
      );
      return;
    }
    let email = this.formGroup.value.email;
    email = email.trim().toLowerCase();
    let name = this.formGroup.value.name;
    name = name === "" ? null : name; // Why do we do this?
    const masterPassword = this.formGroup.value.masterPassword;
    try {
      if (!this.accountCreated) {
        const registerResponse = await this.registerAccount(
          await this.buildRegisterRequest(email, masterPassword, name),
          showToast,
        );
        if (!registerResponse.successful) {
          return;
        }
        this.captchaBypassToken = registerResponse.captchaBypassToken;
        this.accountCreated = true;
      }
      if (this.isInTrialFlow) {
        if (!this.accountCreated) {
          this.toastService.showToast({
            variant: "success",
            title: null,
            message: this.i18nService.t("trialAccountCreated"),
          });
        }
        const loginResponse = await this.logIn(email, masterPassword, this.captchaBypassToken);
        if (loginResponse.captchaRequired) {
          return;
        }
        this.createdAccount.emit(this.formGroup.value.email);
      } else {
        this.toastService.showToast({
          variant: "success",
          title: null,
          message: this.i18nService.t("newAccountCreated"),
        });
        // FIXME: Verify that this floating promise is intentional. If it is, add an explanatory comment and ensure there is proper error handling.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.router.navigate([this.successRoute], { queryParams: { email: email } });
      }
    } catch (e) {
      this.logService.error(e);
    }
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  getStrengthResult(result: any) {
    this.passwordStrengthResult = result;
  }

  getPasswordScoreText(event: PasswordColorText) {
    this.color = event.color;
    this.text = event.text;
  }

  private getErrorToastMessage() {
    const error: AllValidationErrors = this.formValidationErrorService
      .getFormValidationErrors(this.formGroup.controls)
      .shift();

    if (error) {
      switch (error.errorName) {
        case "email":
          return this.i18nService.t("invalidEmail");
        case "inputsDoesntMatchError":
          return this.i18nService.t("masterPassDoesntMatch");
        case "inputsMatchError":
          return this.i18nService.t("hintEqualsPassword");
        case "minlength":
          return this.i18nService.t("masterPasswordMinlength", Utils.minimumPasswordLength);
        default:
          return this.i18nService.t(this.errorTag(error));
      }
    }

    return;
  }

  private errorTag(error: AllValidationErrors): string {
    const name = error.errorName.charAt(0).toUpperCase() + error.errorName.slice(1);
    return `${error.controlName}${name}`;
  }

  //validation would be ignored on selfhosted
  private acceptPoliciesValidation(): ValidatorFn {
    return (control: AbstractControl) => {
      const ctrlValue = control.value;

      return !ctrlValue && this.showTerms ? { required: true } : null;
    };
  }

  private async validateRegistration(showToast: boolean): Promise<{ isValid: boolean }> {
    this.formGroup.markAllAsTouched();
    this.showErrorSummary = true;

    if (this.formGroup.get("acceptPolicies").hasError("required")) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("acceptPoliciesRequired"),
      });
      return { isValid: false };
    }

    //web
    if (this.formGroup.invalid && !showToast) {
      return { isValid: false };
    }

    //desktop, browser
    if (this.formGroup.invalid && showToast) {
      const errorText = this.getErrorToastMessage();
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: errorText,
      });
      return { isValid: false };
    }

    const passwordWeak =
      this.passwordStrengthResult != null && this.passwordStrengthResult.score < 3;
    const passwordLeak =
      this.formGroup.controls.checkForBreaches.value &&
      (await this.auditService.passwordLeaked(this.formGroup.controls.masterPassword.value)) > 0;

    if (passwordWeak && passwordLeak) {
      const result = await this.dialogService.openSimpleDialog({
        title: { key: "weakAndExposedMasterPassword" },
        content: { key: "weakAndBreachedMasterPasswordDesc" },
        type: "warning",
      });

      if (!result) {
        return { isValid: false };
      }
    } else if (passwordWeak) {
      const result = await this.dialogService.openSimpleDialog({
        title: { key: "weakMasterPassword" },
        content: { key: "weakMasterPasswordDesc" },
        type: "warning",
      });

      if (!result) {
        return { isValid: false };
      }
    } else if (passwordLeak) {
      const result = await this.dialogService.openSimpleDialog({
        title: { key: "exposedMasterPassword" },
        content: { key: "exposedMasterPasswordDesc" },
        type: "warning",
      });

      if (!result) {
        return { isValid: false };
      }
    }

    return { isValid: true };
  }

  private async buildRegisterRequest(
    email: string,
    masterPassword: string,
    name: string,
  ): Promise<RegisterRequest> {
    const hint = this.formGroup.value.hint;
    const kdfConfig = DEFAULT_KDF_CONFIG;
    const key = await this.keyService.makeMasterKey(masterPassword, email, kdfConfig);
    const newUserKey = await this.keyService.makeUserKey(key);
    const masterKeyHash = await this.keyService.hashMasterKey(masterPassword, key);
    const keys = await this.keyService.makeKeyPair(newUserKey[0]);
    const request = new RegisterRequest(
      email,
      name,
      masterKeyHash,
      hint,
      newUserKey[1].encryptedString,
      this.referenceData,
      this.captchaToken,
      kdfConfig.kdfType,
      kdfConfig.iterations,
    );
    request.keys = new KeysRequest(keys[0], keys[1].encryptedString);
    if (this.modifyRegisterRequest) {
      await this.modifyRegisterRequest(request);
    }
    return request;
  }

  private async registerAccount(
    request: RegisterRequest,
    showToast: boolean,
  ): Promise<{ successful: boolean; captchaBypassToken?: string }> {
    if (!(await this.validateRegistration(showToast)).isValid) {
      return { successful: false };
    }
    this.formPromise = this.apiService.postRegister(request);
    try {
      const response = await this.formPromise;
      return { successful: true, captchaBypassToken: response.captchaBypassToken };
    } catch (e) {
      if (this.handleCaptchaRequired(e)) {
        return { successful: false };
      } else {
        throw e;
      }
    }
  }

  private async logIn(
    email: string,
    masterPassword: string,
    captchaBypassToken: string,
  ): Promise<{ captchaRequired: boolean }> {
    const credentials = new PasswordLoginCredentials(
      email,
      masterPassword,
      captchaBypassToken,
      null,
    );
    const loginResponse = await this.loginStrategyService.logIn(credentials);
    if (this.handleCaptchaRequired(loginResponse)) {
      return { captchaRequired: true };
    }
    return { captchaRequired: false };
  }
}
