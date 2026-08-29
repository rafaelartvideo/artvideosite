import {
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  customerUpdatePayload,
  validateCustomerForm,
  type CustomerForm,
} from "@/app/admin/shared";
import type { Address } from "@/lib/address";
import {
  saveOrderCustomerAddress,
  updateOrderCustomer,
} from "../infrastructure/orders-customer.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

export function useOrderCustomerPersistence({
  selectedCustomer,
  setSelectedCustomer,
  setEditingCustomer,
  customerDraft,
  customerAddressDraft,
  setAddressExpanded,
  setSaving,
  hasPermission,
  showToast,
}: {
  selectedCustomer: any;
  setSelectedCustomer: Dispatch<SetStateAction<any>>;
  setEditingCustomer: Dispatch<SetStateAction<boolean>>;
  customerDraft: CustomerForm;
  customerAddressDraft: Address;
  setAddressExpanded: Dispatch<SetStateAction<boolean>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  hasPermission: (permission: string) => boolean;
  showToast: (toast: ToastMessage) => void;
}) {
  const persistCustomer = async ({
    standalone,
  }: {
    standalone: boolean;
  }) => {
    if (!selectedCustomer?.id) return false;

    const validationError = validateCustomerForm(customerDraft);
    if (validationError) {
      showToast({ msg: validationError, type: "error" });
      setSaving(false);
      return false;
    }

    setSaving(true);
    const payload = customerUpdatePayload(customerDraft);
    const { error: customerError } = await updateOrderCustomer(
      selectedCustomer.id,
      payload,
    );
    if (customerError) {
      console.error("[ADMIN] customer update error:", customerError);
      showToast({
        msg: `Erro ao atualizar cliente: ${customerError.message}`,
        type: "error",
      });
      setSaving(false);
      return false;
    }

    const address = (selectedCustomer.addresses || []).find(
      (item: Address) => item.is_default,
    ) || selectedCustomer.addresses?.[0];
    const addressPayload = {
      customer_id: selectedCustomer.id,
      zip_code: customerAddressDraft.zip_code || null,
      street: customerAddressDraft.street || null,
      number: customerAddressDraft.number || null,
      complement: customerAddressDraft.complement || null,
      neighborhood: customerAddressDraft.neighborhood || null,
      city: customerAddressDraft.city || null,
      state: customerAddressDraft.state || null,
      is_default: true,
    };
    const addressResult = await saveOrderCustomerAddress(
      address?.id || null,
      addressPayload,
    );
    if (addressResult.error) {
      console.error(
        "[ADMIN] customer address update error:",
        addressResult.error,
      );
      showToast({
        msg: standalone
          ? `Cliente salvo, mas erro no endereço: ${addressResult.error.message}`
          : `Cliente atualizado, mas erro no endereço: ${addressResult.error.message}`,
        type: "error",
      });
      setSaving(false);
      return false;
    }

    setSelectedCustomer({
      ...selectedCustomer,
      ...payload,
      addresses: [customerAddressDraft],
    });
    setEditingCustomer(false);

    if (standalone) {
      setAddressExpanded(true);
      setSaving(false);
      showToast({
        msg: "Dados do cliente atualizados.",
        type: "success",
      });
    }
    return true;
  };

  const saveCustomer = async () => {
    if (!hasPermission("customers.edit")) return false;
    return persistCustomer({ standalone: true });
  };

  const saveCustomerBeforeOrder = () =>
    persistCustomer({ standalone: false });

  return {
    saveCustomer,
    saveCustomerBeforeOrder,
  };
}
