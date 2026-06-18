"use client";

import { useEffect } from "react";
import { useClerk } from "@clerk/nextjs";

export default function SessionTracker() {
    const { signOut, user } = useClerk();
    const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const STORAGE_KEY = "mentorix_last_activity";

    // Dedicated logout broadcast key
    const LOGOUT_EVENT_KEY = "mentorix_logout";

    // Publishes a cross-tab logout event and signs out the current tab
    const broadcastLogout = async () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(LOGOUT_EVENT_KEY, Date.now().toString());
        await signOut();
    }

    useEffect(() => {
        if (!user) return;

        const checkSession = async () => {
            const lastActivity = localStorage.getItem(STORAGE_KEY);
            const now = Date.now();

            if (lastActivity) {
                const elapsed = now - parseInt(lastActivity);
                if (elapsed > SESSION_DURATION) {
                    console.log("[SessionTracker] Session expired. Signing out...");
                    await broadcastLogout();
                    return;
                }
            }

            // Update activity timestamp if session is valid or just started
            localStorage.setItem(STORAGE_KEY, now.toString());
        };

        void checkSession();

        // Optional: Update timestamp on visibility change to keep session alive during active browsing
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                localStorage.setItem(STORAGE_KEY, Date.now().toString());
            }
        };

        // Listen for logout broadcasts from other tabs
        const handleStorageEvent = async (event: StorageEvent) => {
            if (event.key === LOGOUT_EVENT_KEY) {
                await signOut();
            }
        }

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("storage", handleStorageEvent);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("storage", handleStorageEvent);
        }
    }, [user, signOut]);

    return null;
}
