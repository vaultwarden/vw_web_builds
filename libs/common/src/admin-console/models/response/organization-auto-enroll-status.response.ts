import { BaseResponse } from "../../../models/response/base.response";

export class OrganizationAutoEnrollStatusResponse extends BaseResponse {
  id: string;
  identifier: string;
  resetPasswordEnabled: boolean;

  constructor(response: any) {
    super(response);
    this.id = this.getResponseProperty("Id");
    this.identifier = this.getResponseProperty("Identifier");
    this.resetPasswordEnabled = this.getResponseProperty("ResetPasswordEnabled");
  }
}
