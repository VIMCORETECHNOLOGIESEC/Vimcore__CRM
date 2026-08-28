import { ChevronRight, LogOut, Settings, User } from "lucide-react";
import { Link } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/funcionalidades/autenticacion/authContext";
import { CampanaNotificaciones } from "@/funcionalidades/notificaciones/CampanaNotificaciones";
import { usePageHeaderValue } from "./PageHeaderContext";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Encabezado principal: disparador del menú móvil, campana de notificaciones
 * (`CampanaNotificaciones`, F6) y menú de usuario.
 */
export function Header() {
  const { user, logout } = useAuth();
  const header = usePageHeaderValue();

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
      </div>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {header?.backTo ? (
          <>
            <Link
              to={header.backTo.href}
              className="shrink-0 text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:underline"
            >
              {header.backTo.label}
            </Link>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        ) : null}
            <h1 className="truncate text-lg font-semibold text-sidebar-foreground">{header?.title ?? ""}</h1>
      </div>

      <div className="flex items-center gap-2">
        <CampanaNotificaciones />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Avatar className="size-7">
                <AvatarFallback>
                  {user ? getInitials(user.nombre) : <User className="size-4" />}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium text-sidebar-foreground sm:inline">
                {user?.nombre ?? "Usuario"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user?.nombre}</span>
              <span className="text-xs font-normal text-muted-foreground">{user?.correo}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/perfil" className="cursor-pointer">
                <Settings className="size-4" aria-hidden="true" />
                Mi perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void logout()}>
              <LogOut className="size-4" aria-hidden="true" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
