import { t } from "../i18n/messages/account";
import { ApiError } from "./api";

/** Message affiché pour une erreur d'API : choisi d'après le code stable, jamais le texte brut du serveur. */
export function authErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return t("errorGeneric");
  if (error.isNetworkError) return t("errorNetwork");
  switch (error.code) {
    case "invalid_credentials":
      return t("errorInvalidCredentials");
    case "email_taken":
      return t("errorEmailTaken");
    case "rate_limited":
      return t("errorRateLimited");
    case "weak_password":
      switch (error.details.reason) {
        case "too_long":
          return t("errorPasswordLong");
        case "too_common":
          return t("errorPasswordCommon");
        case "same_as_email":
          return t("errorPasswordEmail");
        default:
          return t("errorPasswordShort");
      }
    case "invalid_request":
      return t("errorInvalidEmail");
    default:
      return t("errorGeneric");
  }
}
