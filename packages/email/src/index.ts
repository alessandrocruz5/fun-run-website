export { emailEnvSchema, emailFromSchema, getEmailEnv, resendApiKeySchema } from "./env";
export {
  createEmailClient,
  type EmailClient,
  EmailError,
  type EmailMessage,
  sendRegistrationConfirmed,
  type SendRegistrationConfirmedInput,
  type SendResult,
} from "./send";
export {
  RegistrationConfirmed,
  type RegistrationConfirmedProps,
  registrationConfirmedSubject,
  TEST_PAYMENT_NOTICE,
} from "./templates/registration-confirmed";
