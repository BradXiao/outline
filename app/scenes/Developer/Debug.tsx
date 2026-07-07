import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Heading from "~/components/Heading";
import Scene from "~/components/Scene";
import StepList from "~/components/StepList";
import { debugChangesetsPath } from "~/utils/routeHelpers";

export default function Debug() {
  const { t } = useTranslation();

  const steps = [
    {
      title: t("Open the changeset playground"),
      subtitle: t("Start from the fastest repro surface."),
      description: (
        <Link to={debugChangesetsPath()}>{t("Changeset playground")}</Link>
      ),
    },
    {
      title: t("Check realtime connections"),
      subtitle: t("Confirm the transport is healthy before digging deeper."),
      description: t(
        "Use the connection status panel or DevTools console to confirm active WebSocket traffic."
      ),
    },
    {
      title: t("Review workspace settings"),
      subtitle: t("Validate environment and feature configuration."),
      description: t(
        "Inspect environment variables and enabled feature flags from the admin console."
      ),
    },
  ];

  return (
    <Scene title={t("Debug")}>
      <Heading>{t("Debug")}</Heading>
      <StepList title={t("Debug steps")} steps={steps} />
    </Scene>
  );
}
