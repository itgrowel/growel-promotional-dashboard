import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getLocalDemoRole, setSqlUser } from "@/lib/local-demo-auth";
import { sqlApiRequest } from "@/lib/sql-api";
export const Route = createFileRoute("/_authenticated")({
    ssr: false,
    beforeLoad: async () => {
        const demoRole = getLocalDemoRole();
        if (demoRole) {
            return {
                user: { id: `local-demo-${demoRole}`, email: `demo-${demoRole}@demo.invalid` },
                role: demoRole,
                isLocalDemo: true,
            };
        }
        try {
            const { user } = await sqlApiRequest("/api/auth/session");
            if (!user) throw new Error("Sign in is required.");
            setSqlUser(user);
            return { user, role: user.role, isLocalDemo: false };
        }
        catch {
            throw redirect({ to: "/auth" });
        }
    },
    component: () => <Outlet />,
});
