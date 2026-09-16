export type EmployeeSignature = {
  id: string;
  organization_id: string;
  entity_id: string;
  version: number;
  is_active: boolean;
  storage_path: string;
  signature_hash: string;
  created_by: string | null;
  created_at: string;
  deactivated_at: string | null;
};
