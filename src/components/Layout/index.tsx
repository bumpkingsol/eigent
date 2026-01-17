import TopBar from "@/components/TopBar";
import { Outlet } from "react-router-dom";
import HistorySidebar from "../HistorySidebar";
import { InstallDependencies } from "@/components/InstallStep/InstallDependencies";
import { useAuthStore } from "@/store/authStore";
import { useEffect, useState } from "react";
import { AnimationJson } from "@/components/AnimationJson";
import animationData from "@/assets/animation/onboarding_success.json";
import CloseNoticeDialog from "../Dialog/CloseNotice";
import { useInstallationUI } from "@/store/installationStore";
import { useInstallationSetup } from "@/hooks/useInstallationSetup";
import InstallationErrorDialog from "../InstallStep/InstallationErrorDialog/InstallationErrorDialog";
import Halo from "../Halo";
import useChatStoreAdapter from "@/hooks/useChatStoreAdapter";
import { OpsInbox } from '@/components/OpsInbox';
import { useOpsStore } from '@/store/opsStore';
import { Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Layout = () => {
	const { initState, isFirstLaunch, setIsFirstLaunch, setInitState } = useAuthStore();
	const [noticeOpen, setNoticeOpen] = useState(false);
	const [opsInboxOpen, setOpsInboxOpen] = useState(false);
	const { pendingCount, initialize: initOps } = useOpsStore();

	//Get Chatstore for the active project's task
	const { chatStore } = useChatStoreAdapter();
	if (!chatStore) {
		console.log(chatStore);

		return <div>Loading...</div>;
	}

	const {
		installationState,
		latestLog,
		error,
		backendError,
		isInstalling,
		shouldShowInstallScreen,
		retryInstallation,
		retryBackend,
	} = useInstallationUI();

	useInstallationSetup();

	useEffect(() => {
		initOps();

		// Listen for show-ops-inbox from tray
		const cleanup = window.opsAPI?.onShowOpsInbox(() => {
			setOpsInboxOpen(true);
		});

		return () => cleanup?.();
	}, [initOps]);

	useEffect(() => {
		const handleBeforeClose = () => {
			const currentStatus = chatStore.tasks[chatStore.activeTaskId as string]?.status;
			if(["running", "pause"].includes(currentStatus)) {
				setNoticeOpen(true);
			} else {
				window.electronAPI.closeWindow(true);
			}
		};

		window.ipcRenderer.on("before-close", handleBeforeClose);

		return () => {
			window.ipcRenderer.removeAllListeners("before-close");
		};
	}, [chatStore.tasks, chatStore.activeTaskId]);

	// Determine what to show based on states
	const shouldShowOnboarding = initState === "done" && isFirstLaunch && !isInstalling;

	const actualShouldShowInstallScreen = shouldShowInstallScreen || initState !== 'done' || installationState === 'waiting-backend';
	const shouldShowMainContent = !actualShouldShowInstallScreen;

	return (
		<div className="h-full flex flex-col relative overflow-hidden">
			<TopBar />
			<div className="flex-1 h-full min-h-0 overflow-hidden relative">
				{/* Onboarding animation */}
				{shouldShowOnboarding && (
					<AnimationJson
						onComplete={() => setIsFirstLaunch(false)}
						animationData={animationData}
					/>
				)}

				{/* Installation screen */}
				{actualShouldShowInstallScreen && <InstallDependencies />}

				{/* Main app content */}
				{shouldShowMainContent && (
					<div className="flex h-full">
						<div className="flex-1 min-w-0 relative">
							<Outlet />
							<HistorySidebar />

							{/* Ops Inbox toggle button */}
							<Button
								size="icon"
								variant="ghost"
								onClick={() => setOpsInboxOpen(!opsInboxOpen)}
								className="absolute top-2 right-2 z-40"
								title="Ops Inbox"
							>
								<Inbox className="h-5 w-5" />
								{pendingCount > 0 && (
									<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
										{pendingCount > 9 ? '9+' : pendingCount}
									</span>
								)}
							</Button>
						</div>

						{opsInboxOpen && (
							<aside className="w-96 border-l bg-background flex-shrink-0">
								<OpsInbox onClose={() => setOpsInboxOpen(false)} />
							</aside>
						)}
					</div>
				)}

				{(backendError || (error && installationState === "error")) && (
					<InstallationErrorDialog
						error={error || ""}
						backendError={backendError}
						installationState={installationState}
						latestLog={latestLog}
						retryInstallation={retryInstallation}
						retryBackend={retryBackend}
					/>
				)}

				<CloseNoticeDialog
					onOpenChange={setNoticeOpen}
					open={noticeOpen}
				/>
				<Halo />
			</div>
			</div>
	);
};

export default Layout;
