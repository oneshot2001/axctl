import { List, ActionPanel, Action, Icon, showToast, Toast } from "@raycast/api";
import { useState, useEffect } from "react";
import { spawnSync } from "child_process";

interface DiscoveredDevice {
  ip: string;
  model: string;
  serial: string;
  firmware: string;
  mac: string;
}

export default function DiscoverCameras() {
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function discover() {
      try {
        // Use axctl CLI to discover — it handles mDNS + SSDP
        const result = spawnSync("axctl", ["discover", "-f", "json", "-t", "5"], {
          encoding: "utf8",
          timeout: 10000,
        });

        if (result.status === 0 && result.stdout) {
          const parsed = JSON.parse(result.stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          setDevices(list as DiscoveredDevice[]);
        } else {
          await showToast({
            style: Toast.Style.Failure,
            title: "Discovery failed",
            message: result.stderr || "axctl not found. Install with: bun run build",
          });
        }
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Discovery error",
          message: String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    discover();
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter discovered cameras...">
      {devices.length === 0 && !isLoading ? (
        <List.EmptyView title="No Cameras Found" description="Make sure cameras are on the same network." icon={Icon.Wifi} />
      ) : (
        devices.map((device) => (
          <List.Item
            key={device.ip}
            title={device.ip}
            subtitle={device.model}
            accessories={[
              { text: device.firmware, icon: Icon.Gear },
              { text: device.serial },
            ]}
            actions={
              <ActionPanel>
                <Action.OpenInBrowser title="Open Live Stream" url={`http://${device.ip}/axis-cgi/mjpg/video.cgi`} />
                <Action.CopyToClipboard title="Copy IP" content={device.ip} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
