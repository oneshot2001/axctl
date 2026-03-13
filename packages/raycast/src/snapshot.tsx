import { List, ActionPanel, Action, Icon, Detail, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import { listDevices, getCredentials, hasDatabase } from "./db";
import { digestFetch, getSnapshotUrl } from "./vapix";

export default function CaptureSnapshot() {
  const [snapshotMarkdown, setSnapshotMarkdown] = useState<string | null>(null);
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!hasDatabase()) {
    return (
      <List>
        <List.EmptyView
          title="No Device Registry Found"
          description="Run `axctl discover` to find cameras first."
          icon={Icon.Warning}
        />
      </List>
    );
  }

  if (snapshotMarkdown && selectedIp) {
    return (
      <Detail
        markdown={snapshotMarkdown}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser title="Open in Browser" url={getSnapshotUrl(selectedIp)} />
            <Action title="Back to Camera List" onAction={() => setSnapshotMarkdown(null)} />
          </ActionPanel>
        }
      />
    );
  }

  const devices = listDevices();

  async function captureSnapshot(ip: string) {
    const cred = getCredentials(ip);
    if (!cred) {
      await showToast({ style: Toast.Style.Failure, title: "No credentials", message: `Run: axctl auth add ${ip}` });
      return;
    }

    setIsLoading(true);
    try {
      const url = getSnapshotUrl(ip, "1920x1080");
      const response = await digestFetch(url, cred.username, cred.password);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      setSelectedIp(ip);
      setSnapshotMarkdown(`# Snapshot from ${ip}\n\n![Snapshot](data:image/jpeg;base64,${base64})`);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Snapshot failed", message: String(error) });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Select camera for snapshot...">
      {devices.map((device) => (
        <List.Item
          key={device.ip}
          title={device.ip}
          subtitle={device.model ?? "Unknown"}
          actions={
            <ActionPanel>
              <Action title="Capture Snapshot" icon={Icon.Camera} onAction={() => captureSnapshot(device.ip)} />
              <Action.OpenInBrowser title="Open in Browser" url={getSnapshotUrl(device.ip)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
