import { isValidCpf, isValidBrazilianPhone } from "@/shared/domain/formatters";

export type RegistrationField = "name" | "cpf" | "phone" | "email" | "password" | "confirmPassword";
export type RegistrationValues = Record<RegistrationField, string>;
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export function validateRegistrationField(field: RegistrationField, value: RegistrationValues): string | undefined {
  switch (field) {
    case "name":
      return value.name.trim().split(/\s+/).filter(Boolean).length < 2
        ? "Informe seu nome completo." : undefined;
    case "cpf":
      return !isValidCpf(value.cpf) ? "Informe um CPF válido." : undefined;
    case "phone":
      return !isValidBrazilianPhone(value.phone) ? "Informe um WhatsApp válido com DDD." : undefined;
    case "email":
      return value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())
        ? "Informe um e-mail válido ou deixe em branco." : undefined;
    case "password":
      return value.password.length < 8 ? "A senha deve ter pelo menos 8 caracteres." : undefined;
    case "confirmPassword":
      return !value.confirmPassword ? "Confirme sua senha." :
        value.confirmPassword !== value.password ? "As senhas não coincidem." : undefined;
  }
}
export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const fields: RegistrationField[] = ["name","cpf","phone","email","password","confirmPassword"];
  return Object.fromEntries(fields.flatMap(field => {
    const error = validateRegistrationField(field,values);
    return error ? [[field,error]] : [];
  })) as RegistrationErrors;
}
