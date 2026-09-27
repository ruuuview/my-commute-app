// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import { DynamicNotificationsContext } from '../context';
import type { IDynamicNotificationsContext } from '../interfaces/dynamic-notifications-context.interface';
import { useContext } from "react";

const useDynamicNotifications = (): IDynamicNotificationsContext => {
  const context = useContext(DynamicNotificationsContext);

  if (!context) {
    throw new Error(
      "useDynamicNotifications() must be called inside <DynamicNotifications.Root>.",
    );
  }

  return context;
};

export { useDynamicNotifications };
