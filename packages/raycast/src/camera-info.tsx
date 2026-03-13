import { List, ActionPanel, Action, Icon, Detail, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import { listDevices, getCredentials, hasDatabase } from "./db";
import { getDeviceInfo } from "./vapix";

export default function CameraInfo() {
  const [infoMarkdown, setInfoMarkdown] = useState<string | null>(null);
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

  if (infoMarkdown) {
    return (
      <Detail
        markdown={infoMarkdown}
        actions={
          <ActionPanel>
            <Action title="Back" onAction={() => setInfoMarkdown(null)} />
          </ActionPanel>
        }
      />
    );
  }

  const devices = listDevices();

  async function fetchInfo(ip: string) {
    const cred = getCredentials(ip);
    if (!cred) {
      await showToast({ style: Toast.Style.Failure, title: "No credentials", message: `Run: axctl auth add ${ip}` });
      return;
    }

    setIsLoading(true);
    try {
      const info = await getDeviceInfo(ip, cred.username, cred.password);
      const md = [
        `# ${info.ProdFullName}`,
        "",
        `| Property | Value |`,
        `|----------|-------|`,
        `| **IP** | ${ip} |`,
        `| **Model** | ${info.ProdFullName} |`,
        `| **Serial** | ${info.SerialNumber} |`,
        `| **Firmware** | ${info.Version} |`,
        info.Architecture ? `| **Architecture** | ${info.Architecture} |` : "",
        info.Brand ? `| **Brand** | ${info.Brand} |` : "",
        info.HardwareID ? `| **Hardware ID** | ${info.HardwareID} |` : "",
      ]
        .filter(Boolean)
        .join("\n");
      setInfoMarkdown(md);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to get info", message: String(error) });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Select camera...">
      {devices.map((device) => (
        <List.Item
          key={device.ip}
          title={device.ip}
          subtitle={device.model ?? "Unknown"}
          accessories={[{ text: device.firmware_version ?? "", icon: Icon.Gear }]}
          actions={
            <ActionPanel>
              <Action title="Get Device Info" icon={Icon.Info} onAction={() => fetchInfo(device.ip)} />
              <Action.CopyToClipboard title="Copy IP" content={device.ip} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
