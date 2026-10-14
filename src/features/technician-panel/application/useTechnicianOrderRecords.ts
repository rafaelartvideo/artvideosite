import { useCallback, useEffect, useMemo, useState } from "react";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  createMyTechnicianOrderRecord, listMyTechnicianOrderRecords, type TechnicianOrderRecord,
} from "../infrastructure/technician-tasks.repository";

export function useTechnicianOrderRecords(orderId: string | null, open: boolean) {
  const [rows, setRows] = useState<TechnicianOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");

  const refresh = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      // A tela compartilhada de registros mostra somente anotações humanas, não eventos automáticos.
      setRows((await listMyTechnicianOrderRecords(orderId)).filter(row => row.type === "note"));
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível carregar os registros da OS."), "error");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (open && orderId) void refresh();
  }, [open, orderId, refresh]);

  const submit = async () => {
    const content = text.trim();
    if (!orderId || !content || saving) return;
    setSaving(true);
    try {
      await createMyTechnicianOrderRecord(orderId, content);
      setText("");
      setModalOpen(false);
      await refresh();
      notifyAdmin("Registro adicionado ao histórico.", "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível registrar no histórico."), "error");
    } finally {
      setSaving(false);
    }
  };

  const authorOptions = useMemo(() => {
    const authors = new Map<string, string>();
    for (const item of rows) if (item.authorId) authors.set(item.authorId, item.author);
    return [...authors].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [rows]);

  const entries = useMemo(() => rows
    .filter(row => !userFilter || (userFilter === "system" ? !row.authorId : row.authorId === userFilter))
    .filter(row => !dateFilter || row.createdAt.slice(0, 10) === dateFilter)
    .sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * (sort === "asc" ? 1 : -1)),
  [rows, userFilter, dateFilter, sort]);

  return {
    modalOpen, setModalOpen, text, setText, userFilter, setUserFilter,
    dateFilter, setDateFilter, sort, setSort, entries, authorOptions,
    total: rows.length, loading, saving, submit,
    resetPageState: () => { setModalOpen(false); setText(""); },
    clearFilters: () => { setUserFilter(""); setDateFilter(""); },
  };
}
