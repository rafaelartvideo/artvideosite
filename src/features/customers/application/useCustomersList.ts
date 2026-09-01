import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteCustomer, listCustomers } from "../infrastructure/customers.repository";

type Options = {
  canDelete: boolean;
  onToast: (message: string, type: "success" | "error") => void;
};

export function useCustomersList({ canDelete, onToast }: Options) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.customers.lists(), queryFn: listCustomers });
  const customers = query.data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!query.error) return;
    onToast(
      `Erro ao carregar clientes: ${query.error instanceof Error ? query.error.message : String(query.error)}`,
      "error",
    );
  }, [query.error]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  const normalizeDocument = (value: string) => value.replace(/\D/g, "");
  const filtered = customers.filter(customer => {
    if (!search) return true;
    const normalizedSearch = search.toLowerCase();
    return (customer.full_name || "").toLowerCase().includes(normalizedSearch)
      || (customer.trade_name || "").toLowerCase().includes(normalizedSearch)
      || (customer.legal_name || "").toLowerCase().includes(normalizedSearch)
      || (customer.whatsapp || "").includes(search)
      || (customer.email || "").toLowerCase().includes(normalizedSearch)
      || normalizeDocument(customer.document || "").includes(normalizeDocument(search))
      || normalizeDocument(customer.cnpj || "").includes(normalizeDocument(search));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => setPage(1), [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const remove = async (id: string) => {
    if (!canDelete) return false;
    try {
      await deleteCustomer(id);
      onToast("Cliente excluído.", "success");
      await refresh();
      return true;
    } catch (error) {
      onToast(
        `Não foi possível excluir o cliente: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      return false;
    } finally {
      setDeleteId(null);
    }
  };

  return {
    customers,
    loading: query.isPending,
    isFetching: query.isFetching,
    refetch: query.refetch,
    refresh,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    filtered,
    totalPages,
    safePage,
    pagedCustomers,
    deleteId,
    setDeleteId,
    remove,
  };
}
