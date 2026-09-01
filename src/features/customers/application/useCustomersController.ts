import { useState } from "react";
import { useCustomerDetails } from "./useCustomerDetails";
import { useCustomersList } from "./useCustomersList";
import { useCreateCustomer } from "./useCreateCustomer";

type Options = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function useCustomersController({ canCreate, canEdit, canDelete }: Options) {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const notify = (msg: string, type: "success" | "error") => setToast({ msg, type });

  const list = useCustomersList({ canDelete, onToast: notify });
  const details = useCustomerDetails({
    canEdit,
    onRefresh: list.refresh,
    onToast: notify,
  });
  const creation = useCreateCustomer({
    canCreate,
    onRefresh: list.refresh,
    onToast: notify,
  });

  return { list, details, creation, toast, setToast };
}
