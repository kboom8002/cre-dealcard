"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { UserCircle, LogOut, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface GreetingHeaderProps {
  userName: string;
  userPhotoUrl?: string | null;
}

export function GreetingHeader({ userName, userPhotoUrl }: GreetingHeaderProps) {
  const [greeting, setGreeting] = useState("좋은 하루입니다");
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setGreeting("좋은 아침입니다");
    else if (hour >= 12 && hour < 18) setGreeting("좋은 오후입니다");
    else if (hour >= 18 && hour < 22) setGreeting("수고하셨습니다");
    else setGreeting("편안한 밤 되십시오");

    // 소통 관리함 미확인 + 인앱 알림 미읽음 합산
    Promise.all([
      fetch("/api/broker/inbox?filter=requests&limit=1").then(r => r.ok ? r.json() : { unread_count: 0 }).catch(() => ({ unread_count: 0 })),
      fetch("/api/broker/notifications?limit=1").then(r => r.ok ? r.json() : { unread_count: 0 }).catch(() => ({ unread_count: 0 })),
    ]).then(([inbox, notif]) => {
      setUnreadCount((inbox.unread_count || 0) + (notif.unread_count || 0));
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between pb-5 border-b border-amber-500/15">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/30 uppercase">
            Private Partner
          </span>
        </div>
        <h1 className="text-[26px] font-extrabold text-slate-100 tracking-tight leading-tight">
          {greeting}, <span className="text-amber-300">{userName}</span> 님
        </h1>
        <p className="text-[15px] font-medium text-slate-400 mt-1 leading-relaxed">
          오늘의 자산 브리핑 및 파이프라인 관리 현황입니다.
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Link
          href="/broker/inbox"
          className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:bg-slate-700/80 transition-colors"
          title="소통 관리함"
        >
          <Bell className="w-5 h-5 text-amber-300/90" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 text-[11px] font-black rounded-full w-5 h-5 flex items-center justify-center shadow-lg animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:bg-slate-700/80 transition-colors"
          title="로그아웃"
        >
          <LogOut className="w-4 h-4 text-slate-400 hover:text-slate-200" />
        </button>
        <a
          href="/broker/profile"
          className="flex items-center justify-center p-0.5 rounded-xl border border-amber-500/40 hover:border-amber-400 transition-colors overflow-hidden"
          title="프로필"
        >
          {userPhotoUrl ? (
            <Image
              src={userPhotoUrl}
              alt={userName}
              width={36}
              height={36}
              className="w-9 h-9 rounded-lg object-cover"
            />
          ) : (
            <UserCircle className="w-9 h-9 text-slate-400" />
          )}
        </a>
      </div>
    </div>
  );
}


