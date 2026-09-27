// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";

interface IDynamicNotification {
  id?: string;
  title: string;
  message?: string;
  avatar?: string;
  symbol?: SymbolViewProps["name"];
  accent?: string;
  duration?: number | null;
  onPress?: () => void;
  render?: (notification: IDynamicNotification) => ReactNode;
}

export type { IDynamicNotification };
