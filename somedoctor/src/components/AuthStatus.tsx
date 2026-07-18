"use client";

// 헤더 우측에 로그인 상태를 표시합니다.
// 로그아웃 상태: "로그인" 링크 / 로그인 상태: 이메일 + 로그아웃 버튼.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AuthStatus() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="h-7" aria-hidden="true" />;

  if (!user) {
    return (
      <div className="flex justify-end">
        <Link
          href="/login"
          className="rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-black/[0.03]"
        >
          로그인
        </Link>
      </div>
    );
  }

  const label = user.email ?? user.user_metadata?.name ?? "회원";

  return (
    <div className="flex items-center justify-end gap-2 text-xs">
      <span className="max-w-[160px] truncate text-ink/60" title={label}>
        {label}
      </span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full border border-black/10 px-3 py-1.5 font-semibold text-ink hover:bg-black/[0.03]"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}
