import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h1>
            <p className="text-xs text-muted-foreground mb-4 font-mono break-all">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
