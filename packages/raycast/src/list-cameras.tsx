import { List, ActionPanel, Action, Icon, Color } from "@raycast/api";
import { listDevices, getAllCredentials, hasDatabase } from "./db";

export default function ListCameras() {
  if (!hasDatabase()) {
    return (
      <List>
        <List.EmptyView
          title="No Device Registry Found"
          description="Run `axctl discover` to find cameras and create the registry."
          icon={Icon.Warning}
        />
      </List>
    );
  }

  const devices = listDevices();
  const creds = new Set(getAllCredentials().map((c) => c.ip));

  return (
    <List searchBarPlaceholder="Filter cameras...">
      {devices.map((device) => (
        <List.Item
          key={device.ip}
          title={device.ip}
          subtitle={device.model ?? "Unknown model"}
          accessories={[
            { text: device.firmware_version ?? "", icon: Icon.Gear },
            { text: device.serial ?? "" },
            {
              icon: creds.has(device.ip)
                ? { source: Icon.Lock, tintColor: Color.Green }
                : { source: Icon.LockUnlocked, tintColor: Color.Red },
              tooltip: creds.has(device.ip) ? "Credentials stored" : "No credentials",
            },
          ]}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser title="Open Live Stream" url={`http://${device.ip}/axis-cgi/mjpg/video.cgi`} />
              <Action.CopyToClipboard title="Copy IP" content={device.ip} />
              {device.serial && <Action.CopyToClipboard title="Copy Serial" content={device.serial} />}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
