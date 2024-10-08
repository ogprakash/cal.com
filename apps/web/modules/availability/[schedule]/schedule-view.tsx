"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AvailabilitySettings } from "@calcom/atoms/monorepo";
import { withErrorFromUnknown } from "@calcom/lib/getClientErrorFromUnknown";
import { useCompatSearchParams } from "@calcom/lib/hooks/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { HttpError } from "@calcom/lib/http-error";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { showToast } from "@calcom/ui";

export const AvailabilitySettingsWebWrapper = () => {
  const searchParams = useCompatSearchParams();
  const { t } = useLocale();
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = useMeQuery();
  const scheduleId = searchParams?.get("schedule") ? Number(searchParams.get("schedule")) : -1;
  const fromEventType = searchParams?.get("fromEventType");
  const { timeFormat } = me.data || { timeFormat: null };
  const { data: schedule, isPending } = trpc.viewer.availability.schedule.get.useQuery(
    { scheduleId },
    {
      enabled: !!scheduleId,
    }
  );

  const { data: travelSchedules } = trpc.viewer.getTravelSchedules.useQuery();

  const [isBulkUpdateModalOpen, setIsBulkUpdateModalOpen] = useState(false);
  const bulkUpdateDefaultAvailabilityMutation =
    trpc.viewer.availability.schedule.bulkUpdateToDefaultAvailability.useMutation({
      onSuccess: () => {
        utils.viewer.availability.list.invalidate();
        setIsBulkUpdateModalOpen(false);
        showToast(t("success"), "success");
      },
    });

  const isDefaultSchedule = me.data?.defaultScheduleId === scheduleId;

  const updateMutation = trpc.viewer.availability.schedule.update.useMutation({
    onSuccess: async ({ prevDefaultId, currentDefaultId, ...data }) => {
      if (prevDefaultId && currentDefaultId) {
        // check weather the default schedule has been changed by comparing  previous default schedule id and current default schedule id.
        if (prevDefaultId !== currentDefaultId) {
          // if not equal, invalidate previous default schedule id and refetch previous default schedule id.
          utils.viewer.availability.schedule.get.invalidate({ scheduleId: prevDefaultId });
          utils.viewer.availability.schedule.get.refetch({ scheduleId: prevDefaultId });
        }
      }
      utils.viewer.availability.schedule.get.invalidate({ scheduleId: data.schedule.id });
      utils.viewer.availability.list.invalidate();
      showToast(
        t("availability_updated_successfully", {
          scheduleName: data.schedule.name,
        }),
        "success"
      );
    },
    onError: (err) => {
      if (err instanceof HttpError) {
        const message = `${err.statusCode}: ${err.message}`;
        showToast(message, "error");
      }
    },
  });

  const deleteMutation = trpc.viewer.availability.schedule.delete.useMutation({
    onError: withErrorFromUnknown((err) => {
      showToast(err.message, "error");
    }),
    onSettled: () => {
      utils.viewer.availability.list.invalidate();
    },
    onSuccess: () => {
      showToast(t("schedule_deleted_successfully"), "success");
      router.push("/availability");
    },
  });

  // TODO: reimplement Skeletons for this page in here
  if (isPending) return null;

  // We wait for the schedule to be loaded before rendering the form inside AvailabilitySettings
  // since `defaultValues` cannot be redeclared after first render and using `values` will
  // trigger a form reset when revalidating. Introducing flaky behavior.
  if (!schedule) return null;

  return (
    <AvailabilitySettings
      schedule={schedule}
      travelSchedules={isDefaultSchedule ? travelSchedules || [] : []}
      isDeleting={deleteMutation.isPending}
      isLoading={isPending}
      isSaving={updateMutation.isPending}
      enableOverrides={true}
      timeFormat={timeFormat}
      weekStart={me.data?.weekStart || "Sunday"}
      backPath={fromEventType ? true : "/availability"}
      handleDelete={() => {
        scheduleId && deleteMutation.mutate({ scheduleId });
      }}
      handleSubmit={async ({ dateOverrides, ...values }) => {
        scheduleId &&
          updateMutation.mutate({
            scheduleId,
            dateOverrides: dateOverrides.flatMap((override) => override.ranges),
            ...values,
          });
      }}
      bulkUpdateModalProps={{
        isOpen: isBulkUpdateModalOpen,
        setIsOpen: setIsBulkUpdateModalOpen,
        save: bulkUpdateDefaultAvailabilityMutation.mutate,
        isSaving: bulkUpdateDefaultAvailabilityMutation.isPending,
      }}
    />
  );
};
