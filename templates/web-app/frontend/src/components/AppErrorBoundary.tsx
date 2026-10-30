import { Component, type ErrorInfo } from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string | null;
}

/** Top-level error boundary: catches render errors anywhere below it and
 *  shows a recoverable error page instead of a blank screen. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {this.state.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => window.location.assign("/")}
              className="mt-4 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:brightness-95"
            >
              Back to home
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
