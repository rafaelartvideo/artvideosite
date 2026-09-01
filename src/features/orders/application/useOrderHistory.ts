import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createServiceOrderHistoryNote,
  listServiceOrderHistoryNotes,
} from "../infrastructure/orders.repository";

type ToastMessage = { msg: string; type: "success" | "error" };
type ProfileOption = { id: string; full_name?: string | null };

export function useOrderHistory({
  orderId,
  userId,
  statusHistory,
  profiles,
  showToast,
}: {
  orderId?: string;
  userId?: string;
  statusHistory: any[];
  profiles: ProfileOption[];
  showToast: (toast: ToastMessage) => void;
}) {
  const queryClient = useQueryClient();
  const [pageOpen, setPageOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");

  const notesQuery = useQuery({
    queryKey: ["orders", "history-notes", orderId || ""],
    enabled: Boolean(orderId),
    queryFn: async () => {
      const { data, error } = await listServiceOrderHistoryNotes(orderId!);
      if (error) throw error;
      return data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const content = text.trim();
      if (!orderId || !userId || !content) throw new Error("Registro inválido.");
      const { data, error } = await createServiceOrderHistoryNote({
        serviceOrderId: orderId,
        authorId: userId,
        content,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders", "history-notes", orderId || ""] });
      setText("");
      setModalOpen(false);
      showToast({ msg: "Registro adicionado ao histórico.", type: "success" });
    },
    onError: (error: any) => {
      showToast({ msg: `Não foi possível registrar no histórico: ${error?.message || "Erro desconhecido"}`, type: "error" });
    },
  });

  const entries = useMemo(() => {
    const automatic = statusHistory.map((item) => {
      const authorId = item.created_by || item.changed_by || null;
      return {
        id: `status-${item.id}`,
        type: "system" as const,
        authorId,
        author: authorId ? profiles.find((profile) => profile.id === authorId)?.full_name || "Usuário não informado" : "Sistema",
        title: item.order_status?.name || "Status alterado",
        content: item.notes || "Alteração registrada automaticamente.",
        createdAt: item.created_at,
      };
    });
    const written = (notesQuery.data || []).map((item: any) => ({
      id: `note-${item.id}`,
      type: "note" as const,
      authorId: item.author_id,
      author: profiles.find((profile) => profile.id === item.author_id)?.full_name || "Usuário não informado",
      title: "Registro da equipe",
      content: item.content,
      createdAt: item.created_at,
    }));
    return [...automatic, ...written]
      .filter((item) => !userFilter || (userFilter === "system" ? !item.authorId : item.authorId === userFilter))
      .filter((item) => !dateFilter || new Date(item.createdAt).toISOString().slice(0, 10) === dateFilter)
      .sort((left, right) => (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * (sort === "asc" ? 1 : -1));
  }, [statusHistory, notesQuery.data, profiles, userFilter, dateFilter, sort]);

  const authorOptions = useMemo(() => {
    const ids = new Set<string>();
    [...statusHistory, ...(notesQuery.data || [])].forEach((item: any) => {
      const id = item.author_id || item.created_by || item.changed_by;
      if (id) ids.add(id);
    });
    return [...ids].map((id) => ({ id, name: profiles.find((profile) => profile.id === id)?.full_name || "Usuário não informado" }));
  }, [statusHistory, notesQuery.data, profiles]);

  const closePage = () => {
    setPageOpen(false);
    setModalOpen(false);
    setText("");
  };

  return {
    pageOpen, setPageOpen, modalOpen, setModalOpen, text, setText,
    userFilter, setUserFilter, dateFilter, setDateFilter, sort, setSort,
    entries, authorOptions, total: statusHistory.length + (notesQuery.data?.length || 0),
    loading: notesQuery.isLoading, saving: createMutation.isPending,
    submit: () => createMutation.mutate(), closePage,
    clearFilters: () => { setUserFilter(""); setDateFilter(""); },
  };
}
