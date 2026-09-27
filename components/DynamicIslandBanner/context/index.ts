// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import type { IDynamicNotificationsContext } from '../interfaces/dynamic-notifications-context.interface';
import { createContext } from "react";

const DynamicNotificationsContext =
  createContext<IDynamicNotificationsContext | null>(null);

export { DynamicNotificationsContext };
