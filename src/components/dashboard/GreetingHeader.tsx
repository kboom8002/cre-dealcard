"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserCircle, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface GreetingHeaderProps {
  userName: string;
}

export function GreetingHeader({ userName }: GreetingHeaderProps) {
  const [greeting, setGreeting] = useState("좋은 하루예요");
  const router = useRouter();

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setGreeting("좋은 아침이에요");
    else if (hour >= 12 && hour < 18) setGreeting("좋은 오후예요");
    else if (hour >= 18 && hour < 22) setGreeting("수고하셨어요");
    else setGreeting("밤 늦게까지 고생하시네요");
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
      <div className="flex items-center gap-3">
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>로그아웃</span>
        </button>
        <a
          href="/broker/profile"
          className="flex items-center justify-center p-1.5 rounded-full hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
          title="프로필"
        >
          <UserCircle className="w-8 h-8" />
        </a>
      </div>
    </div>
  );
}
