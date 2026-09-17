function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function buildVerificationPath(code) {
  const value = text(code, 160);
  if (!value) throw new Error("Código de verificação inválido.");
  return `/verificar-documento/${encodeURIComponent(value)}`;
}

export function requiredSignatureKinds(row) {
  const result = [];
  if (row?.require_employee_signature === true) result.push("employee");
  if (row?.require_external_signature === true) result.push("external");
  return result;
}

export function minimalVerificationPayload(row, signatures = [], company = {}) {
  const safeSignatures = (Array.isArray(signatures) ? signatures : []).map(signature => {
    const rawMethod = String(signature?.validation_method || "");
    const validationMethod = rawMethod === "stored_employee_signature"
      ? "stored_employee_signature"
      : rawMethod === "cpf_cnpj"
        ? "cpf_cnpj"
        : "email_otp";

    return {
      signer_type: signature?.signer_type === "employee" ? "employee" : "external",
      signer_name: text(signature?.signer_name, 220) || "—",
      signer_document_masked: text(signature?.signer_document_masked, 80) || null,
      validation_method: validationMethod,
      signed_at: signature?.signed_at || null,
    };
  });

  return {
    valid: true,
    company_name: text(company?.name || company?.legal_name, 220) || "Empresa",
    document_name: text(row?.template_name_snapshot, 220) || "Documento",
    order_number: text(row?.order_number_snapshot, 100) || "—",
    signed_at: row?.signed_at || null,
    verification_code: text(row?.verification_code, 160),
    snapshot_hash: text(row?.snapshot_hash, 64),
    final_pdf_hash: text(row?.final_pdf_hash, 64),
    signers: safeSignatures,
  };
}
