"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from "@/lib/observability/error-reporter";

export interface ErrorBoundaryProps {
  children?: ReactNode;
  title?: string;
  className?: string;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  referenceCode: string | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  public state: State = {
    hasError: false,
    error: null,
    referenceCode: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      referenceCode: generateErrorReferenceCode(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    void reportClientOrServerError(error, { boundary: "ErrorBoundary" });
    this.props.onError?.(error, errorInfo);
  }

  public reset = () => {
    this.props.onReset?.();
    this.setState({ hasError: false, error: null, referenceCode: null });
  };

  public render() {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.reset);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      const title = this.props.title || "컴포넌트를 불러오는 중 문제가 발생했습니다";
      const refCode =
        this.state.referenceCode ?? generateErrorReferenceCode(this.state.error);

      return (
        <div
          className={cn(
            "flex flex-col items-center justify-center p-6 border border-border rounded-xl bg-card text-card-foreground my-4 text-center shadow-sm",
            this.props.className
          )}
        >
          <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-3">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <p className="text-sm font-mono text-muted-foreground mt-1">
            오류 참조코드: {refCode}
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
