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
  const [greeting, setGreeting] = useState("좋은 하루예요");
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setGreeting("좋은 아침이에요");
    else if (hour >= 12 && hour < 18) setGreeting("좋은 오후예요");
    else if (hour >= 18 && hour < 22) setGreeting("수고하셨어요");
    else setGreeting("밤 늦게까지 고생하시네요");

    // Fetch unread count
    fetch("/api/broker/inbox?filter=requests&limit=1")
      .then((res) => res.json())
      .then((data) => setUnreadCount(data.unread_count || 0))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between pb-4">
      <div>
        <p className="text-xl font-bold text-foreground">
          {greeting}, {userName}님!
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          오늘도 성공적인 딜을 응원합니다.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/broker/inbox"
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted/30 transition-colors"
          title="소통 관리함"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>로그아웃</span>
        </button>
        <a
          href="/broker/profile"
          className="flex items-center justify-center p-1 rounded-full hover:bg-neutral-800 transition-colors overflow-hidden"
          title="프로필"
        >
          {userPhotoUrl ? (
            <Image
              src={userPhotoUrl}
              alt={userName}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <UserCircle className="w-8 h-8 text-muted-foreground" />
          )}
        </a>
      </div>
    </div>
  );
}
