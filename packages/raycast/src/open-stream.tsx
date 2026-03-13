import { showToast, Toast, open } from "@raycast/api";
import { listDevices, hasDatabase } from "./db";
import { getLiveStreamUrl } from "./vapix";

export default async function OpenStream() {
  if (!hasDatabase()) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No Device Registry",
      message: "Run `axctl discover` first",
    });
    return;
  }

  const devices = listDevices();
  if (devices.length === 0) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No Cameras",
      message: "No cameras in the registry",
    });
    return;
  }

  // Open the first camera's stream (quick action)
  const first = devices[0]!;
  const url = getLiveStreamUrl(first.ip);
  await open(url);
  await showToast({
    style: Toast.Style.Success,
    title: "Opening Stream",
    message: `${first.ip} (${first.model ?? "camera"})`,
  });
}
