import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Check, ChevronDown, ClipboardCheck, FileBarChart, LayoutDashboard, LogOut, Menu, Moon, PackageOpen, Search, ShieldCheck, ShoppingCart, Sun, Users, X, } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { clearLocalDemoSession, clearSqlUser, getCurrentRole, getLocalDemoRole, getSqlUser, isLocalDemoSession } from "@/lib/local-demo-auth";
import { useLocalDemoPermission } from "@/lib/local-demo-permissions";
import { sqlApiRequest } from "@/lib/sql-api";
import { formatRequestMaterials, getRequestMaterialItems, useSampleEmployees, useSampleMaterials, useSampleRequests } from "@/lib/sample-operations";
const navigation = [
    { label: "Dashboard", icon: LayoutDashboard, to: "/" },
    { label: "Requests", icon: ShoppingCart, to: "/requests" },
    { label: "Approvals", icon: ClipboardCheck, to: "/approvals" },
    { label: "Reports", icon: FileBarChart, to: "/reports" },
    { label: "Employees", icon: Users, to: "/employees" },
    { label: "Materials", icon: PackageOpen, to: "/materials" },
];
const READ_NOTIFICATIONS_KEY = "growel-read-notifications-v1";

function getReadNotificationIds(storageKey) {
    if (typeof window === "undefined") return [];
    try {
        const savedIds = window.localStorage.getItem(storageKey);
        if (!savedIds) return [];
        const parsedIds = JSON.parse(savedIds);
        if (!Array.isArray(parsedIds) || parsedIds.some((id) => typeof id !== "string")) {
            throw new Error("Saved notification read state has an invalid format.");
        }
        return parsedIds;
    }
    catch (error) {
        console.error("Could not load notification read state.", error);
        return [];
    }
}

function BrandMark() {
    return (<div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-extrabold text-sidebar-primary-foreground">G</div>
      <div className="leading-tight">
        <p className="text-sm font-extrabold text-sidebar-foreground">Growel</p>
        <p className="text-[10px] font-semibold uppercase text-sidebar-foreground/55">Promotional</p>
      </div>
    </div>);
}
export function AppShell({ children }) {
    const localDemoRole = getLocalDemoRole();
    const currentRole = getCurrentRole();
    const readNotificationsStorageKey = `${READ_NOTIFICATIONS_KEY}:${currentRole || "account"}`;
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [displayName, setDisplayName] = useState("User");
    const [role, setRole] = useState("Employee");
    const [theme, setTheme] = useState("light");
    const [themeReady, setThemeReady] = useState(false);
    const [globalSearch, setGlobalSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [readNotificationIds, setReadNotificationIds] = useState(() => getReadNotificationIds(readNotificationsStorageKey));
    const [notificationError, setNotificationError] = useState("");
    const [apiErrorMessage, setApiErrorMessage] = useState("");
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const localDemo = isLocalDemoSession();
    const sampleRequests = useSampleRequests();
    const sampleMaterials = useSampleMaterials();
    const sampleEmployees = useSampleEmployees();
    const executiveDemo = currentRole === "executive";
    const managerDemo = ["rm", "avp", "gm"].includes(currentRole);
    const canViewDashboard = useLocalDemoPermission(currentRole, "viewDashboard");
    const canCreateRequests = useLocalDemoPermission(currentRole, "createRequests");
    const canApproveRequests = useLocalDemoPermission(currentRole, "approveRequests");
    const canManageEmployees = useLocalDemoPermission(currentRole, "manageEmployees");
    const canManageMaterials = useLocalDemoPermission(currentRole, "manageMaterials");
    const canDispatchRequests = useLocalDemoPermission(currentRole, "dispatchRequests");
    const canManagePermissions = useLocalDemoPermission(currentRole, "managePermissions");
    const canAccessRequests = canCreateRequests || canApproveRequests;
    const canAccessApprovals = executiveDemo || canApproveRequests || canDispatchRequests;
    const roleNavigation = localDemo
        ? executiveDemo
            ? navigation.filter((item) => ["Dashboard", "Requests", "Approvals"].includes(item.label))
            : managerDemo
                ? navigation.filter((item) => !["Employees", "Materials"].includes(item.label))
                : navigation
        : navigation;
    const permittedNavigation = roleNavigation.filter((item) => {
        if (item.label === "Dashboard") return canViewDashboard;
        if (item.label === "Requests") return canAccessRequests;
        if (item.label === "Approvals") return canAccessApprovals;
        if (item.label === "Employees") return currentRole?.toLowerCase() === "admin" || canManageEmployees;
        if (item.label === "Materials") return canManageMaterials;
        return true;
    });
    const visibleRequests = executiveDemo
        ? sampleRequests.filter((request) => request.createdByRole === "executive" || request.role === "Executive")
        : sampleRequests;
    const managerReviewCount = canApproveRequests ? sampleRequests.filter((request) =>
        request.status === "Pending Approval" ||
        (request.status === "Revised" && (!request.revisedForRole || request.revisedForRole === currentRole)),
    ).length : 0;
    const hrWorkflowCount = sampleRequests.filter((request) => ["Approved", "Under Packing"].includes(request.status)).length;
    const approvalCount = executiveDemo
        ? 0
        : managerDemo
            ? sampleRequests.filter((request) => ["Approved", "Under Packing", "Dispatched"].includes(request.status)).length
            : hrWorkflowCount;
    const activeRequestNotifications = visibleRequests.filter((request) => {
        if (executiveDemo) return request.status !== "Received";
        if (managerDemo) return canApproveRequests && (
            request.status === "Pending Approval" ||
            (request.status === "Revised" && (!request.revisedForRole || request.revisedForRole === currentRole))
        );
        if (currentRole === "hr") return canDispatchRequests && ["Approved", "Under Packing"].includes(request.status);
        return ["Pending Approval", "Revised", "Approved", "Under Packing", "Dispatched"].includes(request.status);
    });
    const notifications = [
        ...activeRequestNotifications.map((request) => ({
                id: `${request.id}:${request.status}:${request.revisionNumber || 0}`,
                title: request.status === "Revised" && request.revisedByRole === "hr" && (executiveDemo || managerDemo)
                        ? managerDemo
                            ? `${request.id} was revised by HR; review the new quantities`
                            : `${request.id} quantities were revised by HR`
                    : request.status === "Revised" && request.revisedByRole && request.revisedByRole !== "hr" && executiveDemo
                        ? `${request.id} quantities were revised by ${request.revisedByRole.toUpperCase()}`
                    : request.status === "Dispatched" && executiveDemo
                        ? `${request.id} is ready to be acknowledged`
                        : managerDemo && ["Pending Approval", "Revised"].includes(request.status)
                            ? `${request.id} is awaiting manager review`
                        : currentRole === "hr" && request.status === "Approved"
                            ? `${request.id} is ready for HR packing`
                        : request.status === "Under Packing"
                            ? `${request.id} is being packed by HR`
                        : request.status === "Approved"
                            ? `${request.id} was approved and sent to HR`
                        : request.status === "Revised"
                            ? `${request.id} needs updates`
                            : `${request.id} is awaiting approval`,
                description: `${request.requester} · ${formatRequestMaterials(request)} · ${request.status}`,
                to: executiveDemo || currentRole === "hr" || request.status === "Approved" || request.status === "Under Packing" ? "/approvals" : "/requests",
                kind: "request",
            })),
        ...(canManageMaterials ? sampleMaterials
            .filter((material) => material.stock <= material.minimum)
            .map((material) => ({
                id: `${material.id}:${material.stock === 0 ? "out" : "low"}`,
                title: material.stock === 0 ? `${material.name} is out of stock` : `${material.name} is low on stock`,
                description: `${material.stock} ${material.unit} remaining · Minimum ${material.minimum}`,
                to: "/materials",
                kind: "stock",
            })) : []),
    ];
    const unreadNotifications = notifications.filter((notification) => !readNotificationIds.includes(notification.id));

    useEffect(() => {
        function handleApiError(event) {
            setApiErrorMessage(event.detail || "The server could not load operational data.");
        }
        window.addEventListener("growel-api-error", handleApiError);
        return () => window.removeEventListener("growel-api-error", handleApiError);
    }, []);

    function markNotificationRead(notificationId) {
        const nextReadIds = [...new Set([...readNotificationIds, notificationId])];
        setNotificationError("");
        try {
            window.localStorage.setItem(readNotificationsStorageKey, JSON.stringify(nextReadIds));
            setReadNotificationIds(nextReadIds);
        }
        catch (error) {
            console.error("Could not save notification read state.", error);
            setNotificationError("This alert could not be marked as read. Check browser storage and try again.");
        }
    }
    const normalizedSearch = globalSearch.trim().toLowerCase();
    const searchResults = normalizedSearch
        ? [
            ...(canAccessRequests ? visibleRequests
                .filter((request) => [
                    request.id,
                    request.requester,
                    request.region,
                    request.status,
                    request.purpose || "",
                    ...getRequestMaterialItems(request).map((item) => item.material),
                ].some((value) => value.toLowerCase().includes(normalizedSearch)))
                .slice(0, 5)
                .map((request) => ({
                    id: `request-${request.id}`,
                    title: request.id,
                    description: `${request.requester} · ${formatRequestMaterials(request)}`,
                    kind: "request",
                })) : []),
            ...(canManageMaterials ? sampleMaterials
                .filter((material) => [material.name, material.category, material.id].some((value) => value.toLowerCase().includes(normalizedSearch)))
                .slice(0, 4)
                .map((material) => ({
                    id: `material-${material.id}`,
                    title: material.name,
                    description: `${material.id} · ${material.category}`,
                    kind: "material",
                })) : []),
            ...(canManageEmployees ? sampleEmployees
                .filter((employee) => [employee.name, employee.email, employee.role, employee.region].some((value) => value.toLowerCase().includes(normalizedSearch)))
                .slice(0, 4)
                .map((employee) => ({
                    id: `employee-${employee.id}`,
                    title: employee.name,
                    description: `${employee.role} · ${employee.region}`,
                    kind: "employee",
                })) : []),
        ].slice(0, 10)
        : [];

    function openSearchResult(result) {
        const query = globalSearch.trim();
        setSearchOpen(false);
        const to = result.kind === "material"
            ? "/materials"
            : result.kind === "employee"
                ? "/employees"
                : "/requests";
        void navigate({ to, search: { q: query } });
    }

    function openFirstSearchResult(event) {
        if (event.key === "Escape") {
            setSearchOpen(false);
            return;
        }
        if (event.key === "Enter" && searchResults.length > 0) {
            event.preventDefault();
            openSearchResult(searchResults[0]);
        }
    }
    useEffect(() => {
        function loadTheme() {
            try {
                const savedTheme = window.localStorage.getItem("growel-theme");
                if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
            }
            catch (error) {
                console.error("Could not read the saved theme preference.", error);
            }
            setThemeReady(true);
        }
        loadTheme();
        function syncTheme(event) {
            if (event.key === "growel-theme" && (event.newValue === "light" || event.newValue === "dark")) {
                setTheme(event.newValue);
            }
        }
        window.addEventListener("storage", syncTheme);
        return () => window.removeEventListener("storage", syncTheme);
    }, []);
    useEffect(() => {
        if (!themeReady) return;
        document.documentElement.classList.toggle("dark", theme === "dark");
        try {
            window.localStorage.setItem("growel-theme", theme);
        }
        catch (error) {
            console.error("Could not save the theme preference.", error);
        }
    }, [theme, themeReady]);
    useEffect(() => {
        if (localDemo) {
            const roleLabels = {
                executive: "Executive",
                rm: "RM · Regional Manager",
                avp: "AVP · Assistant Vice President",
                gm: "GM · General Manager",
                hr: "HR",
                admin: "Admin",
            };
            const selectedRole = currentRole || "admin";
            setDisplayName(`Demo ${roleLabels[selectedRole].split(" · ")[0]}`);
            setRole(`${roleLabels[selectedRole]} · local demo`);
            return;
        }
        const sqlUser = getSqlUser();
        if (sqlUser) {
            setDisplayName(sqlUser.displayName || sqlUser.email.split("@")[0] || "User");
            setRole(`${sqlUser.role.toUpperCase()} · SQL account`);
        }
    }, [localDemo, localDemoRole, currentRole]);
    async function handleSignOut() {
        await queryClient.cancelQueries();
        queryClient.clear();
        if (localDemo) {
            clearLocalDemoSession();
            await navigate({ to: "/auth", replace: true });
            return;
        }
        await sqlApiRequest("/api/auth/logout", { method: "POST" });
        clearSqlUser();
        await navigate({ to: "/auth", replace: true });
    }
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
    return (<div className="min-h-screen bg-background">
      {sidebarOpen && (<button aria-label="Close navigation" className="fixed inset-0 z-30 bg-foreground/30 lg:hidden" onClick={() => setSidebarOpen(false)}/>)}

      <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-20 items-center justify-between px-5">
          <BrandMark />
          <button aria-label="Close navigation" className="grid size-9 place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="size-5"/>
          </button>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1 px-3 py-6">
          {[...permittedNavigation, ...(currentRole === "admin" && canManagePermissions ? [{ label: "Permissions", icon: ShieldCheck, to: "/admin-permissions" }] : [])].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to && item.to !== "/" ? true : item.to === "/" && pathname === "/" && item.label === "Dashboard";
            return (<Link key={item.label} to={item.to} onClick={() => setSidebarOpen(false)} className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}`}>
                <Icon className={`shrink-0 ${item.label === "Materials" ? "size-5 stroke-[2.5]" : "size-[18px]"}`} aria-hidden="true"/>
                <span className="flex-1 text-left">{item.label}</span>
                {item.label === "Requests" && managerDemo && managerReviewCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-sidebar-foreground/10 text-[10px]">{managerReviewCount}</span>}
                {item.label === "Approvals" && approvalCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-sidebar-foreground/10 text-[10px]">{approvalCount}</span>}
              </Link>);
        })}
        </nav>
        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-md bg-sidebar-accent p-3">
            <p className="text-xs font-semibold text-sidebar-accent-foreground">Need assistance?</p>
            <p className="mt-1 text-[11px] leading-4 text-sidebar-foreground/55">Contact your system administrator.</p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur md:px-7">
          <button aria-label="Open navigation" className="grid size-10 shrink-0 place-items-center rounded-md text-foreground hover:bg-muted lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="size-5"/>
          </button>
          <div
            className="relative hidden w-full max-w-md sm:block"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
            }}
          >
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
            <input
              aria-label="Search requests, materials, employees"
              aria-expanded={searchOpen && normalizedSearch.length > 0}
              aria-controls="global-search-results"
              autoComplete="off"
              value={globalSearch}
              onChange={(event) => {
                  setGlobalSearch(event.target.value);
                  setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={openFirstSearchResult}
              placeholder="Search requests, materials, employees..."
              className="h-10 w-full rounded-md border border-input bg-muted/50 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {searchOpen && normalizedSearch.length > 0 && (
              <div id="global-search-results" role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-md border border-border bg-card p-2 shadow-lg">
                {searchResults.length > 0 ? searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => openSearchResult(result)}
                    className="block w-full rounded-sm px-3 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <span className="block truncate text-sm font-semibold">{result.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.description}</span>
                  </button>
                )) : (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching requests, materials, or employees.</p>
                )}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onClick={() => setTheme((currentTheme) => currentTheme === "dark" ? "light" : "dark")}
              className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="size-[18px]"/> : <Moon className="size-[18px]"/>}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label={`Notifications${unreadNotifications.length ? `, ${unreadNotifications.length} unread alerts` : ""}`} title="Notifications" className="relative grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Bell className="size-[18px]"/>
                  {unreadNotifications.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground ring-2 ring-card">{unreadNotifications.length > 99 ? "99+" : unreadNotifications.length}</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[min(70vh,32rem)] w-80 overflow-y-auto">
                <DropdownMenuLabel className="flex items-center justify-between gap-3">
                  <span>Unread alerts</span>
                  <span className="text-xs font-normal text-muted-foreground">{unreadNotifications.length}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notificationError && <p role="alert" className="px-3 py-2 text-xs font-semibold text-destructive">{notificationError}</p>}
                {unreadNotifications.length > 0 ? unreadNotifications.map((notification) => (
                  <DropdownMenuItem key={`${notification.kind}-${notification.id}`} asChild className="h-auto cursor-pointer items-start gap-3 py-3">
                    <Link to={notification.to} onClick={() => markNotificationRead(notification.id)} className="whitespace-normal">
                      <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${notification.kind === "stock" ? "bg-warning-soft text-warning" : "bg-primary/10 text-primary"}`}>
                        {notification.kind === "stock" ? <AlertTriangle className="size-4"/> : <Check className="size-4"/>}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{notification.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{notification.description}</span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                )) : (
                  <div className="px-3 py-8 text-center text-sm text-muted-foreground">You’re all caught up.</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="mx-1 h-8 w-px bg-border"/>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto gap-2 p-1.5">
                  <span className="grid size-9 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{initials}</span>
                  <span className="hidden text-left sm:block"><span className="block max-w-32 truncate text-xs font-bold">{displayName}</span><span className="block text-[10px] text-muted-foreground">{role}</span></span>
                  <ChevronDown className="hidden size-4 text-muted-foreground sm:block"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel><span className="block truncate">{displayName}</span><span className="text-xs font-normal text-muted-foreground">{role}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleSignOut()} className="text-destructive focus:text-destructive">
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-7 md:py-8">
          {apiErrorMessage && <aside role="alert" className="mb-5 rounded-lg border border-destructive/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-destructive">{apiErrorMessage}</aside>}
          {localDemo && <aside role="note" className="mb-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"><span className="font-bold text-primary">Local test mode.</span>{" "}Sample data only; no real user, admin privileges, or staff records are connected.</aside>}
          {children}
        </main>
      </div>
    </div>);
}
