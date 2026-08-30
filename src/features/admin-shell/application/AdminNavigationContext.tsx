import { createContext, type Dispatch, type SetStateAction } from "react";
import type { AdminPageState } from "../domain/admin.types";

export const AdminPageContext = createContext<{
  page: AdminPageState;
  setPage: Dispatch<SetStateAction<AdminPageState>>;
} | null>(null);

export const AdminBackContext = createContext<(() => void) | null>(null);
