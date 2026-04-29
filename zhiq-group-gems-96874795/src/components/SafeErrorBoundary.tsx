import React, { Component, ReactNode } from "react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    errorMsg: string;
}

export class SafeErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        errorMsg: ""
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, errorMsg: error.message };
    }

    public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("SafeErrorBoundary caught an error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-10 bg-red-100 border-4 border-red-500 rounded-xl m-10">
                    <h1 className="text-2xl font-bold text-red-700 mb-4">A página quebrou ao renderizar!</h1>
                    <p className="text-red-900 font-mono bg-red-50 p-4 rounded whitespace-pre-wrap">
                        {this.state.errorMsg}
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}
