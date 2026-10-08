"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import SiteHeader from "@/components/site-header";
import { useI18n } from "@/lib/i18n";
import { ROUTES } from "@/lib/routes";
import styles from "@/components/app-shell.module.css";
import marketing from "@/components/marketing/marketing.module.css";

function isApplicationPath(pathname: string): boolean {
  return pathname !== ROUTES.home && pathname !== ROUTES.templates && pathname !== ROUTES.create;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ROUTES.home;
  const { t } = useI18n();

  if (!isApplicationPath(pathname)) {
    return (
      <div className={marketing.shell} data-marketing-shell>
        <SiteHeader />
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
    );
  }

  return (
    <div className={styles.appShell} data-app-shell>
      <a className={styles.skipLink} href="#main-content">{t("nav.skipToContent")}</a>
      <AppHeader />
      <main className={styles.appMain} data-app-main id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
