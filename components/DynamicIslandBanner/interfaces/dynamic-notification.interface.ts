// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";

type NotificationTier = 'compact' | 'standard' | 'expanded';

interface IDynamicNotification {
  id?: string;
  title: string;
  message?: string;
  avatar?: string;
  symbol?: SymbolViewProps["name"];
  accent?: string;
  beamAccent?: string;
  duration?: number | null;
  tier?: NotificationTier;
  priority?: number;      // severe 3, minor 2, boarding 2, recovery 1, primer 1
  expiresAt?: number;     // epoch ms; drop on dequeue
  onPress?: () => void;
  render?: (notification: IDynamicNotification) => ReactNode;
}

export type { IDynamicNotification, NotificationTier };

