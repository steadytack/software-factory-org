import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, expectData } from "../api/client";

export interface NotificationItem {
  id: string;
  user_email: string;
  title: string;
  body: string | null;
  link: string | null;
  url: string | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => {
      const call = () => api.GET("/api/notifications");
      return expectData(call(), call);
    },
    refetchInterval: 60_000, // keep the unread badge fresh
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectData(
        () => api.POST("/api/notifications/{notification_id}/read", {
          params: { path: { notification_id: id } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      expectData(() => api.POST("/api/notifications/read-all", {})),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectData(
        () => api.DELETE("/api/notifications/{notification_id}", {
          params: { path: { notification_id: id } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
/** Hide one notification from the bell for good (unlike delete, which lets
 *  a later notification for the same thing be created). */
export function useDismissNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      expectData(
        () => api.POST("/api/notifications/{notification_id}/dismiss", {
          params: { path: { notification_id: id } },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDismissAllNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => expectData(() => api.POST("/api/notifications/dismiss-all", {})),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
