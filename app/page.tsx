"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YearCalendar, AllDayEvent } from "@/components/year-calendar";
import {
  ChevronLeft,
  ChevronRight,
  Unlink,
  Plus,
  RefreshCcw,
  Settings,
  X,
  Clock,
  Calendar as CalendarIcon,
  Users,
  UserPlus,
  Share2,
  Trash2,
  Copy,
  Check,
  LogOut,
  Crown,
} from "lucide-react";
import { formatDateKey } from "@/lib/utils";
import { CalendarListItem } from "@/types/calendar";

type LinkedAccount = {
  accountId: string;
  email?: string;
  status?: number;
  error?: string;
};

type FamilyMember = {
  id: string;
  userId: string;
  role: string;
  name?: string;
  email?: string;
  image?: string;
  joinedAt: string;
};

type Family = {
  id: string;
  name: string;
  inviteCode?: string;
  role: string;
  memberCount: number;
  calendarCount: number;
  members: FamilyMember[];
  createdAt: string;
};

type FamilyCalendar = {
  id: string;
  calendarId: string;
  displayName?: string;
  color?: string;
  sharedBy: {
    id: string;
    name?: string;
    email?: string;
  };
  createdAt: string;
};

export default function HomePage() {
  const { data: session, status } = useSession();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [events, setEvents] = useState<AllDayEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [calendars, setCalendars] = useState<CalendarListItem[]>([]);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] =
    useState<boolean>(false);
  const [calendarColors, setCalendarColors] = useState<Record<string, string>>(
    {}
  );
  const [hiddenEventIds, setHiddenEventIds] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [showDaysOfWeek, setShowDaysOfWeek] = useState<boolean>(false);
  const [alignWeekends, setAlignWeekends] = useState<boolean>(false);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [createTitle, setCreateTitle] = useState<string>("");
  const [createStartDate, setCreateStartDate] = useState<string>("");
  const [createHasEndDate, setCreateHasEndDate] = useState<boolean>(false);
  const [createEndDate, setCreateEndDate] = useState<string>("");
  const [createCalendarId, setCreateCalendarId] = useState<string>("");
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>("");
  const createDateFromDayClick = useRef<string | null>(null);
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const endDateInputRef = useRef<HTMLInputElement | null>(null);
  const preferencesLoaded = useRef<boolean>(false);
  const [preferencesLoadedState, setPreferencesLoadedState] = useState<boolean>(false);

  // Family state
  const [families, setFamilies] = useState<Family[]>([]);
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null);
  const [familyCalendars, setFamilyCalendars] = useState<FamilyCalendar[]>([]);
  const [familyEvents, setFamilyEvents] = useState<AllDayEvent[]>([]);
  const [familyModalOpen, setFamilyModalOpen] = useState<boolean>(false);
  const [familyModalTab, setFamilyModalTab] = useState<"list" | "create" | "join" | "manage" | "share">("list");
  const [newFamilyName, setNewFamilyName] = useState<string>("");
  const [joinCode, setJoinCode] = useState<string>("");
  const [familySubmitting, setFamilySubmitting] = useState<boolean>(false);
  const [familyError, setFamilyError] = useState<string>("");
  const [selectedFamilyForManage, setSelectedFamilyForManage] = useState<Family | null>(null);
  const [copiedInviteCode, setCopiedInviteCode] = useState<boolean>(false);

  const mergeCalendarColorsWithDefaults = (
    calendars: CalendarListItem[],
    existingColors: Record<string, string>
  ): Record<string, string> => {
    const next: Record<string, string> = { ...existingColors };
    for (const c of calendars) {
      if (!next[c.id]) {
        next[c.id] = c.backgroundColor || "#cbd5e1";
      }
    }
    return next;
  };

  const groupCalendarsByAccount = (
    calendars: CalendarListItem[],
    accounts: LinkedAccount[]
  ): Array<{ accountId: string; email: string; list: CalendarListItem[] }> => {
    if (accounts.length > 0) {
      return accounts.map((acc) => ({
        accountId: acc.accountId,
        email: acc.email || "Other",
        list: calendars.filter((c) => c.id.startsWith(`${acc.accountId}|`)),
      }));
    }
    // Fallback grouping if accounts not provided
    const map = new Map<string, CalendarListItem[]>();
    const emailByAcc = new Map<string, string>();
    for (const c of calendars) {
      const accId = c.id.includes("|") ? c.id.split("|")[0] : "";
      const email = c.accountEmail || "Other";
      emailByAcc.set(accId, email);
      const key = accId || email;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      accountId: key,
      email: emailByAcc.get(key) || "Other",
      list,
    }));
  };

  const extractAccountIdFromCalendarId = (calendarId: string): string => {
    return calendarId.includes("|") ? calendarId.split("|")[0] : "";
  };

  const getAccountIdsFromCalendars = (
    calendars: CalendarListItem[]
  ): string[] => {
    return Array.from(
      new Set(
        calendars
          .map((c) => extractAccountIdFromCalendarId(c.id))
          .filter(Boolean)
      )
    );
  };

  const handleLinkingReturnCalendarSelection = (
    list: CalendarListItem[],
    selectedCalendarIds: string[],
    allIds: string[]
  ): string[] => {
    let beforeIds: string[] = [];
    try {
      beforeIds =
        JSON.parse(localStorage.getItem("preLinkAccountIds") || "[]") || [];
    } catch {}
    const beforeSet = new Set(beforeIds);
    const currentAccountIds = getAccountIdsFromCalendars(list);
    const newAccountIdSet = new Set(
      currentAccountIds.filter((id) => !beforeSet.has(id))
    );
    const currentFiltered = selectedCalendarIds.filter((id) =>
      allIds.includes(id)
    );
    const toAdd = list
      .filter((c) => {
        const accId = extractAccountIdFromCalendarId(c.id);
        return accId && newAccountIdSet.has(accId);
      })
      .map((c) => c.id);
    return Array.from(new Set([...currentFiltered, ...toAdd]));
  };

  const handleNormalLoadCalendarSelection = (
    list: CalendarListItem[],
    selectedCalendarIds: string[],
    allIds: string[],
    preferencesLoaded: boolean
  ): string[] => {
    const validCurrent = selectedCalendarIds.filter((id) =>
      allIds.includes(id)
    );

    // Check for new accounts
    const currentAccIds = new Set(
      validCurrent
        .map((id) => extractAccountIdFromCalendarId(id))
        .filter(Boolean)
    );
    const allAccIds = getAccountIdsFromCalendars(list);
    const newAccIds = allAccIds.filter((id) => !currentAccIds.has(id));

    if (preferencesLoaded) {
      // Preferences loaded - filter invalid and add new accounts
      if (newAccIds.length > 0) {
        const toAdd = list
          .filter((c) => {
            const accId = extractAccountIdFromCalendarId(c.id);
            return accId && newAccIds.includes(accId);
          })
          .map((c) => c.id);
        return Array.from(new Set([...validCurrent, ...toAdd]));
      } else {
        // Just filter invalid calendars
        return validCurrent;
      }
    } else {
      // Preferences not loaded yet - first time user, auto-select all
      return allIds;
    }
  };

  const writableCalendars = useMemo(() => {
    const canWrite = new Set(["owner", "writer"]);
    return calendars.filter((c) =>
      c.accessRole ? canWrite.has(c.accessRole) : false
    );
  }, [calendars]);
  const writableAccountsWithCalendars = useMemo(() => {
    const grouped = groupCalendarsByAccount(writableCalendars, accounts);
    return grouped.filter((group) => group.list.length > 0);
  }, [writableCalendars, accounts]);
  const accountsWithCalendars = useMemo(() => {
    return groupCalendarsByAccount(calendars, accounts);
  }, [accounts, calendars]);
  const calendarNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of calendars) {
      map[c.id] = c.summary;
    }
    return map;
  }, [calendars]);
  const calendarAccounts = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of calendars) {
      if (c.accountEmail) map[c.id] = c.accountEmail;
    }
    return map;
  }, [calendars]);

  // Load preferences from server when authenticated
  useEffect(() => {
    if (status === "authenticated" && !preferencesLoaded.current) {
      fetch("/api/preferences")
        .then((res) => res.json())
        .then((data) => {
          // Only mark as loaded after successfully fetching preferences
          preferencesLoaded.current = true;
          setPreferencesLoadedState(true);
          if (data.selectedCalendarIds !== undefined) {
            setSelectedCalendarIds(data.selectedCalendarIds);
          }
          if (data.hiddenEventIds !== undefined) {
            setHiddenEventIds(data.hiddenEventIds);
          }
          if (data.showDaysOfWeek !== undefined) {
            setShowDaysOfWeek(data.showDaysOfWeek);
          }
          if (data.alignWeekends !== undefined) {
            setAlignWeekends(data.alignWeekends);
          }
          if (data.showHidden !== undefined) {
            setShowHidden(data.showHidden);
          }
          if (data.calendarColors !== undefined) {
            setCalendarColors(data.calendarColors);
          }
          if (data.activeFamilyId !== undefined) {
            setActiveFamilyId(data.activeFamilyId);
          }
        })
        .catch((err) => {
          console.error("Failed to load preferences:", err);
          preferencesLoaded.current = false;
          setPreferencesLoadedState(false);
        });
    } else if (status !== "authenticated") {
      preferencesLoaded.current = false;
      setPreferencesLoadedState(false);
    }
  }, [status]);

  // Load families when authenticated
  useEffect(() => {
    if (status === "authenticated") {
      loadFamilies();
    } else {
      setFamilies([]);
      setActiveFamilyId(null);
      setFamilyCalendars([]);
      setFamilyEvents([]);
    }
  }, [status]);

  // Load family calendars and events when active family changes
  useEffect(() => {
    if (activeFamilyId) {
      loadFamilyCalendars(activeFamilyId);
      loadFamilyEvents(activeFamilyId, year);
    } else {
      setFamilyCalendars([]);
      setFamilyEvents([]);
    }
  }, [activeFamilyId, year]);

  // Handle calendar selection when both calendars and preferences are loaded
  // This runs when preferences finish loading (if calendars are already loaded)
  // or when calendars finish loading (if preferences are already loaded)
  const processedCalendarSelectionRef = useRef<boolean>(false);
  useEffect(() => {
    if (
      status === "authenticated" &&
      preferencesLoadedState &&
      calendars.length > 0 &&
      !processedCalendarSelectionRef.current
    ) {
      processedCalendarSelectionRef.current = true;
      const allIds = calendars.map((c) => c.id);
      
      // Check if we have a saved selection from preferences
      // selectedCalendarIds from preferences will be set when preferences load
      // We need to check the actual state at this point
      const currentSelection = selectedCalendarIds;
      
      // If we have no saved selection (empty array), auto-select all for first-time user
      if (currentSelection.length === 0) {
        setSelectedCalendarIds(allIds);
      } else {
        // We have a saved selection - filter invalid and add new account calendars
        const validSelection = currentSelection.filter((id) =>
          allIds.includes(id)
        );
        // Check for new accounts and auto-add their calendars
        const currentAccIds = new Set(
          validSelection
            .map((id) => extractAccountIdFromCalendarId(id))
            .filter(Boolean)
        );
        const allAccIds = getAccountIdsFromCalendars(calendars);
        const newAccIds = allAccIds.filter((id) => !currentAccIds.has(id));
        if (newAccIds.length > 0) {
          const toAdd = calendars
            .filter((c) => {
              const accId = extractAccountIdFromCalendarId(c.id);
              return accId && newAccIds.includes(accId);
            })
            .map((c) => c.id);
          const newSelection = Array.from(
            new Set([...validSelection, ...toAdd])
          );
          setSelectedCalendarIds(newSelection);
        } else if (validSelection.length !== currentSelection.length) {
          // Just filter invalid calendars
          setSelectedCalendarIds(validSelection);
        }
      }
    }
    if (status !== "authenticated") {
      processedCalendarSelectionRef.current = false;
    }
  }, [status, preferencesLoadedState, calendars, selectedCalendarIds]);

  const visibleEvents = useMemo(() => {
    // If in family view, show family events
    if (activeFamilyId) {
      return familyEvents;
    }
    // Otherwise show personal events
    if (showHidden) return events;
    return events.filter((e) => !hiddenEventIds.includes(e.id));
  }, [events, hiddenEventIds, showHidden, activeFamilyId, familyEvents]);

  useEffect(() => {
    if (status !== "authenticated") {
      setEvents([]);
      return;
    }
    const controller = new AbortController();
    const qs = `/api/events?year=${year}${
      selectedCalendarIds.length
        ? `&calendarIds=${encodeURIComponent(selectedCalendarIds.join(","))}`
        : ""
    }`;
    fetch(qs, { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!controller.signal.aborted) {
          setEvents(data.events || []);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setEvents([]);
        }
      });
    return () => controller.abort();
  }, [status, year, selectedCalendarIds]);

  useEffect(() => {
    if (status !== "authenticated") {
      setCalendars([]);
      setSelectedCalendarIds([]);
      // Don't remove selectedCalendarIds from localStorage when signing out
      // so they persist when user signs back in
      return;
    }
    fetch(`/api/calendars`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        // Always update calendars list
        const list = (data.calendars || []) as CalendarListItem[];
        const accs = (data.accounts || []) as LinkedAccount[];
        setCalendars(list);
        if (Array.isArray(accs) && accs.length > 0) {
          setAccounts(accs);
        } else {
          // derive unique accounts from calendars
          const uniq = Array.from(
            new Map(
              list
                .map((c) => ({
                  accountId: c.id.includes("|") ? c.id.split("|")[0] : "",
                  email: c.accountEmail,
                }))
                .filter((x) => x.accountId)
                .map((x) => [x.accountId, x])
            ).values()
          );
          setAccounts(uniq);
        }
        // Handle calendar selection: filter invalid, add new account calendars
        const allIds = list.map((c) => c.id);
        const url =
          typeof window !== "undefined" ? new URL(window.location.href) : null;
        const isLinkingReturn =
          !!url && url.searchParams.get("linkingAccount") === "1";

        let newSelection: string[];
        if (isLinkingReturn) {
          // Linking return: add calendars from new accounts
          newSelection = handleLinkingReturnCalendarSelection(
            list,
            selectedCalendarIds,
            allIds
          );
          setSelectedCalendarIds(newSelection);
          // Cleanup
          try {
            localStorage.removeItem("preLinkAccountIds");
          } catch {}
          if (url) {
            url.searchParams.delete("linkingAccount");
            history.replaceState({}, "", url.toString());
          }
        } else {
          // Normal load: don't modify calendar selection here
          // Calendar selection is handled by the separate useEffect that runs
          // after both preferences and calendars are loaded
          // This prevents race conditions where calendars load before preferences
        }

        // Update calendar colors (merge with existing, add defaults for new calendars)
        const next = mergeCalendarColorsWithDefaults(list, calendarColors);
        if (JSON.stringify(next) !== JSON.stringify(calendarColors)) {
          setCalendarColors(next);
        }
      })
      .catch(() => {
        setCalendars([]);
        setSelectedCalendarIds([]);
        setCalendarColors({});
      });
  }, [status, preferencesLoadedState]);

  useEffect(() => {
    if (!createOpen) {
      // Clear date when dialog closes so it doesn't persist
      setCreateStartDate("");
      createDateFromDayClick.current = null;
      return;
    }
    setCreateError("");
    setCreateTitle("");
    setCreateHasEndDate(false);
    setCreateEndDate("");
    // Use date from day click if available, otherwise use default
    if (createDateFromDayClick.current) {
      setCreateStartDate(createDateFromDayClick.current);
      createDateFromDayClick.current = null;
    } else {
      const now = new Date();
      const defaultDate =
        now.getFullYear() === year ? now : new Date(year, 0, 1);
      setCreateStartDate(formatDateKey(defaultDate));
    }
    // Prefer a writable primary calendar; else first writable; else first overall.
    const primaryWritable = writableCalendars.find((c) => c.primary)?.id;
    const firstWritable = writableCalendars[0]?.id;
    const firstAny = calendars[0]?.id;
    setCreateCalendarId(primaryWritable || firstWritable || firstAny || "");
  }, [createOpen, calendars, writableCalendars, year]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && createOpen && !createSubmitting) {
        setCreateOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [createOpen, createSubmitting]);

  // Persist preferences to server whenever they change
  useEffect(() => {
    if (status === "authenticated" && preferencesLoaded.current) {
      // Debounce API calls to avoid too many requests
      const timeoutId = setTimeout(() => {
        fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedCalendarIds,
            hiddenEventIds,
            showDaysOfWeek,
            alignWeekends,
            showHidden,
            calendarColors,
            activeFamilyId,
          }),
        }).catch((err) => {
          console.error("Failed to save preferences:", err);
        });
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [
    status,
    selectedCalendarIds,
    hiddenEventIds,
    showDaysOfWeek,
    alignWeekends,
    showHidden,
    calendarColors,
    activeFamilyId,
  ]);

  const onPrev = () => setYear((y) => y - 1);
  const onNext = () => setYear((y) => y + 1);
  const onRefresh = async () => {
    if (status !== "authenticated") {
      setEvents([]);
      return;
    }
    try {
      setIsRefreshing(true);
      // 1) Reload calendars from all linked accounts
      const calendarsRes = await fetch(`/api/calendars`, { cache: "no-store" });
      const calendarsData = await calendarsRes.json();
      const newCalendars = (calendarsData.calendars || []) as {
        id: string;
        summary: string;
        primary?: boolean;
        backgroundColor?: string;
        accountEmail?: string;
      }[];
      setCalendars(newCalendars);
      // Keep existing selection; don't auto-select new calendars
      const allIds = newCalendars.map((c) => c.id);
      const mergedSelected = selectedCalendarIds.filter((id) =>
        allIds.includes(id)
      );
      setSelectedCalendarIds(mergedSelected);
      // Merge default colors for any new calendars
      const nextColors = mergeCalendarColorsWithDefaults(
        newCalendars,
        calendarColors
      );
      setCalendarColors(nextColors);
      // 2) Reload events for the current year using the merged selection
      const qs = `/api/events?year=${year}${
        mergedSelected.length
          ? `&calendarIds=${encodeURIComponent(mergedSelected.join(","))}`
          : ""
      }`;
      const eventsRes = await fetch(qs, { cache: "no-store" });
      const eventsData = await eventsRes.json();
      setEvents(eventsData.events || []);
    } catch {
      // keep existing events on failure
    } finally {
      setIsRefreshing(false);
    }
  };
  const disconnectAccount = async (accountId: string) => {
    try {
      await fetch("/api/accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      await onRefresh();
    } catch {
      // ignore
    }
  };

  // Family functions
  const loadFamilies = async () => {
    try {
      const res = await fetch("/api/family", { cache: "no-store" });
      const data = await res.json();
      if (data.families) {
        setFamilies(data.families);
      }
    } catch (err) {
      console.error("Failed to load families:", err);
    }
  };

  const loadFamilyCalendars = async (familyId: string) => {
    try {
      const res = await fetch(`/api/family/calendars?familyId=${familyId}`, { cache: "no-store" });
      const data = await res.json();
      if (data.calendars) {
        setFamilyCalendars(data.calendars);
      }
    } catch (err) {
      console.error("Failed to load family calendars:", err);
    }
  };

  const loadFamilyEvents = async (familyId: string, targetYear: number) => {
    try {
      const res = await fetch(`/api/family/events?familyId=${familyId}&year=${targetYear}`, { cache: "no-store" });
      const data = await res.json();
      if (data.events) {
        setFamilyEvents(data.events);
      }
    } catch (err) {
      console.error("Failed to load family events:", err);
      setFamilyEvents([]);
    }
  };

  const createFamily = async () => {
    if (!newFamilyName.trim()) {
      setFamilyError("Family name is required.");
      return;
    }
    setFamilySubmitting(true);
    setFamilyError("");
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFamilyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFamilyError(data.error || "Failed to create family.");
        return;
      }
      await loadFamilies();
      setNewFamilyName("");
      setFamilyModalTab("list");
    } catch {
      setFamilyError("Failed to create family.");
    } finally {
      setFamilySubmitting(false);
    }
  };

  const joinFamily = async () => {
    if (!joinCode.trim()) {
      setFamilyError("Invite code is required.");
      return;
    }
    setFamilySubmitting(true);
    setFamilyError("");
    try {
      const res = await fetch("/api/family/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFamilyError(data.error || "Failed to join family.");
        return;
      }
      await loadFamilies();
      setJoinCode("");
      setFamilyModalTab("list");
    } catch {
      setFamilyError("Failed to join family.");
    } finally {
      setFamilySubmitting(false);
    }
  };

  const leaveFamily = async (familyId: string, memberId: string) => {
    try {
      const res = await fetch(`/api/family/members?familyId=${familyId}&memberId=${memberId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (activeFamilyId === familyId) {
          setActiveFamilyId(null);
        }
        await loadFamilies();
        setSelectedFamilyForManage(null);
        setFamilyModalTab("list");
      }
    } catch {
      // ignore
    }
  };

  const deleteFamily = async (familyId: string) => {
    try {
      const res = await fetch(`/api/family?familyId=${familyId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        if (activeFamilyId === familyId) {
          setActiveFamilyId(null);
        }
        await loadFamilies();
        setSelectedFamilyForManage(null);
        setFamilyModalTab("list");
      }
    } catch {
      // ignore
    }
  };

  const shareCalendarWithFamily = async (familyId: string, calendarId: string) => {
    try {
      const res = await fetch("/api/family/calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyId, calendarId }),
      });
      if (res.ok) {
        await loadFamilyCalendars(familyId);
      }
    } catch {
      // ignore
    }
  };

  const unshareCalendarFromFamily = async (familyCalendarId: string) => {
    try {
      const res = await fetch(`/api/family/calendars?familyCalendarId=${familyCalendarId}`, {
        method: "DELETE",
      });
      if (res.ok && activeFamilyId) {
        await loadFamilyCalendars(activeFamilyId);
      }
    } catch {
      // ignore
    }
  };

  const copyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedInviteCode(true);
      setTimeout(() => setCopiedInviteCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const activeFamily = useMemo(() => {
    return families.find((f) => f.id === activeFamilyId) || null;
  }, [families, activeFamilyId]);

  const onCreateEvent = async () => {
    if (status !== "authenticated") return;
    setCreateError("");
    if (!createTitle.trim()) {
      setCreateError("Title is required.");
      return;
    }
    if (!createStartDate) {
      setCreateError("Date is required.");
      return;
    }
    if (!createCalendarId) {
      setCreateError("Calendar is required.");
      return;
    }
    if (createHasEndDate && createEndDate && createEndDate < createStartDate) {
      setCreateError("End date must be on/after start date.");
      return;
    }
    try {
      setCreateSubmitting(true);
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle.trim(),
          startDate: createStartDate,
          endDate: createHasEndDate
            ? createEndDate || createStartDate
            : undefined,
          calendarId: createCalendarId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError((data && data.error) || "Failed to create event.");
        return;
      }
      setCreateOpen(false);
      await onRefresh();
    } catch {
      setCreateError("Failed to create event.");
    } finally {
      setCreateSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col">
      <div className="grid grid-cols-3 items-center p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
            disabled={status !== "authenticated"}
            className="text-2xl p-2 hover:bg-transparent"
          >
            ☰
          </Button>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-transparent"
            onClick={onPrev}
            aria-label="Previous year"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="font-semibold text-lg min-w-[5ch] text-center leading-none">
            {year}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-transparent"
            onClick={onNext}
            aria-label="Next year"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={() => setCreateOpen(true)}
            disabled={status !== "authenticated"}
            aria-label="Create event"
            title={
              status === "authenticated"
                ? "Create event"
                : "Sign in to create events"
            }
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {createOpen && (
        <>
          <div
            className="fixed inset-0 bg-background/60 z-40"
            onClick={() => {
              if (!createSubmitting) {
                setCreateOpen(false);
              }
            }}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            role="dialog"
            aria-label="Create event"
          >
            <div
              className="w-full max-w-md rounded-md border bg-card shadow-lg pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div className="font-semibold">Create event</div>
                <button
                  className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-2"
                  onClick={() =>
                    createSubmitting ? null : setCreateOpen(false)
                  }
                  aria-label="Close"
                  disabled={createSubmitting}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-4 pt-2 pb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
                    <Plus className="h-4 w-4" />
                  </div>
                  <input
                    className="flex-1 border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-0 placeholder:text-muted-foreground"
                    placeholder="Event title"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    disabled={createSubmitting}
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
                    <CalendarIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <div className="flex items-center">
                      <input
                        ref={startDateInputRef}
                        type="date"
                        className="border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-0 w-24 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                        value={createStartDate}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCreateStartDate(v);
                          if (
                            createHasEndDate &&
                            createEndDate &&
                            v &&
                            createEndDate < v
                          ) {
                            setCreateEndDate(v);
                          }
                        }}
                        onClick={(e) => {
                          e.currentTarget.showPicker?.();
                          e.currentTarget.focus();
                        }}
                        disabled={createSubmitting}
                      />
                      {createHasEndDate && (
                        <>
                          <span className="text-muted-foreground">–</span>
                          <input
                            ref={endDateInputRef}
                            type="date"
                            className="border-0 bg-transparent px-0 py-1 text-sm focus:outline-none focus:ring-0 ml-2 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                            value={createEndDate}
                            min={createStartDate || undefined}
                            onChange={(e) => setCreateEndDate(e.target.value)}
                            onClick={(e) => {
                              e.currentTarget.showPicker?.();
                              e.currentTarget.focus();
                            }}
                            disabled={createSubmitting}
                          />
                        </>
                      )}
                    </div>
                    {createHasEndDate ? (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setCreateHasEndDate(false);
                          setCreateEndDate("");
                        }}
                        disabled={createSubmitting}
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setCreateHasEndDate(true);
                          if (!createEndDate) setCreateEndDate(createStartDate);
                        }}
                        disabled={createSubmitting}
                      >
                        Add end date
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {createCalendarId && calendarColors[createCalendarId] ? (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{
                          backgroundColor: calendarColors[createCalendarId],
                        }}
                      />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-muted" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Select
                      value={createCalendarId}
                      onValueChange={setCreateCalendarId}
                      disabled={createSubmitting}
                    >
                      <SelectTrigger className="w-full border-0 bg-transparent px-0 py-1 h-auto shadow-none focus:ring-0 justify-start gap-1">
                        <SelectValue placeholder="Select a calendar" />
                      </SelectTrigger>
                      <SelectContent>
                        {writableCalendars.length > 0
                          ? writableAccountsWithCalendars.map(
                              ({ accountId, email, list }) => (
                                <SelectGroup key={accountId || email}>
                                  <SelectLabel>
                                    {email && email.length
                                      ? email
                                      : accountId || "Account"}
                                  </SelectLabel>
                                  {list.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.summary}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )
                            )
                          : calendars.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {(c.accountEmail
                                  ? `${c.accountEmail} — `
                                  : "") + c.summary}
                              </SelectItem>
                            ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {writableCalendars.length === 0 && calendars.length > 0 && (
                  <div className="text-xs text-muted-foreground pl-8">
                    No writable calendars found; creating may fail on read-only
                    calendars.
                  </div>
                )}
                {createError && (
                  <div className="text-sm text-destructive pl-8">
                    {createError}
                  </div>
                )}
              </div>
              <div className="p-4 border-t flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={createSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  onClick={onCreateEvent}
                  disabled={
                    createSubmitting ||
                    status !== "authenticated" ||
                    !createTitle.trim()
                  }
                >
                  {createSubmitting ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
      {/* Family management modal */}
      {familyModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-background/60 z-40"
            onClick={() => {
              if (!familySubmitting) {
                setFamilyModalOpen(false);
                setFamilyError("");
              }
            }}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            role="dialog"
            aria-label="Manage families"
          >
            <div
              className="w-full max-w-md rounded-md border bg-card shadow-lg pointer-events-auto max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b">
                <div className="font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {familyModalTab === "list" && "My Families"}
                  {familyModalTab === "create" && "Create Family"}
                  {familyModalTab === "join" && "Join Family"}
                  {familyModalTab === "manage" && (selectedFamilyForManage?.name || "Manage Family")}
                  {familyModalTab === "share" && "Share Calendars"}
                </div>
                <button
                  className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-2"
                  onClick={() => familySubmitting ? null : setFamilyModalOpen(false)}
                  aria-label="Close"
                  disabled={familySubmitting}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {familyModalTab === "list" && (
                  <div className="space-y-3">
                    {families.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        You're not part of any family yet.
                      </div>
                    ) : (
                      families.map((f) => (
                        <div
                          key={f.id}
                          className="p-3 border rounded-md hover:bg-accent/50 cursor-pointer"
                          onClick={() => {
                            setSelectedFamilyForManage(f);
                            setFamilyModalTab("manage");
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium flex items-center gap-2">
                              {f.name}
                              {f.role === "admin" && (
                                <Crown className="h-3 w-3 text-yellow-500" />
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {f.memberCount} member{f.memberCount !== 1 ? "s" : ""} • {f.calendarCount} calendar{f.calendarCount !== 1 ? "s" : ""}
                          </div>
                        </div>
                      ))
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setFamilyError("");
                          setFamilyModalTab("create");
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setFamilyError("");
                          setFamilyModalTab("join");
                        }}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Join
                      </Button>
                    </div>
                  </div>
                )}
                {familyModalTab === "create" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Family Name</label>
                      <input
                        type="text"
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                        placeholder="e.g. The Smiths"
                        value={newFamilyName}
                        onChange={(e) => setNewFamilyName(e.target.value)}
                        disabled={familySubmitting}
                        autoFocus
                      />
                    </div>
                    {familyError && (
                      <div className="text-sm text-destructive">{familyError}</div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setFamilyError("");
                          setFamilyModalTab("list");
                        }}
                        disabled={familySubmitting}
                      >
                        Back
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={createFamily}
                        disabled={familySubmitting || !newFamilyName.trim()}
                      >
                        {familySubmitting ? "Creating..." : "Create Family"}
                      </Button>
                    </div>
                  </div>
                )}
                {familyModalTab === "join" && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Invite Code</label>
                      <input
                        type="text"
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                        placeholder="Paste the invite code here"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        disabled={familySubmitting}
                        autoFocus
                      />
                    </div>
                    {familyError && (
                      <div className="text-sm text-destructive">{familyError}</div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setFamilyError("");
                          setFamilyModalTab("list");
                        }}
                        disabled={familySubmitting}
                      >
                        Back
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={joinFamily}
                        disabled={familySubmitting || !joinCode.trim()}
                      >
                        {familySubmitting ? "Joining..." : "Join Family"}
                      </Button>
                    </div>
                  </div>
                )}
                {familyModalTab === "manage" && selectedFamilyForManage && (
                  <div className="space-y-4">
                    {/* Invite code section for admins */}
                    {selectedFamilyForManage.role === "admin" && selectedFamilyForManage.inviteCode && (
                      <div className="p-3 bg-muted/50 rounded-md">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Invite Code</div>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm bg-background px-2 py-1 rounded border truncate">
                            {selectedFamilyForManage.inviteCode}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyInviteCode(selectedFamilyForManage.inviteCode!)}
                          >
                            {copiedInviteCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>
                    )}
                    {/* Members */}
                    <div>
                      <div className="text-sm font-medium mb-2">Members ({selectedFamilyForManage.members.length})</div>
                      <div className="space-y-2">
                        {selectedFamilyForManage.members.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 p-2 border rounded-md">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                              {(m.name || m.email || "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{m.name || m.email || "Unknown"}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                {m.role === "admin" && <Crown className="h-3 w-3 text-yellow-500" />}
                                {m.role}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="space-y-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2"
                        onClick={() => setFamilyModalTab("share")}
                      >
                        <Share2 className="h-4 w-4" />
                        Share calendars with this family
                      </Button>
                      {selectedFamilyForManage.role === "admin" ? (
                        <Button
                          variant="destructive"
                          className="w-full justify-start gap-2"
                          onClick={() => {
                            if (confirm(`Delete "${selectedFamilyForManage.name}"? This will remove all members and shared calendars.`)) {
                              deleteFamily(selectedFamilyForManage.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete family
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                          onClick={() => {
                            const myMember = selectedFamilyForManage.members.find(
                              (m) => m.userId === (session as any)?.user?.id
                            );
                            if (myMember && confirm(`Leave "${selectedFamilyForManage.name}"?`)) {
                              leaveFamily(selectedFamilyForManage.id, myMember.id);
                            }
                          }}
                        >
                          <LogOut className="h-4 w-4" />
                          Leave family
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSelectedFamilyForManage(null);
                        setFamilyModalTab("list");
                      }}
                    >
                      Back to list
                    </Button>
                  </div>
                )}
                {familyModalTab === "share" && selectedFamilyForManage && (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground">
                      Select calendars to share with {selectedFamilyForManage.name}:
                    </div>
                    <div className="space-y-2 max-h-60 overflow-auto">
                      {calendars.map((c) => {
                        const isShared = familyCalendars.some((fc) => fc.calendarId === c.id);
                        return (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 p-2 border rounded-md hover:bg-accent/50"
                          >
                            <input
                              type="checkbox"
                              className="accent-foreground"
                              checked={isShared}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  shareCalendarWithFamily(selectedFamilyForManage.id, c.id);
                                } else {
                                  const fc = familyCalendars.find((f) => f.calendarId === c.id);
                                  if (fc) {
                                    unshareCalendarFromFamily(fc.id);
                                  }
                                }
                              }}
                            />
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: calendarColors[c.id] || c.backgroundColor || "#cbd5e1" }}
                            />
                            <span className="text-sm truncate flex-1">{c.summary}</span>
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setFamilyModalTab("manage")}
                    >
                      Back
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-background/60 z-40"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] bg-card border-r shadow-lg flex flex-col"
            role="dialog"
            aria-label="Menu"
          >
            {/* View selector */}
            {status === "authenticated" && (
              <div className="p-2 border-b">
                <div className="flex items-center gap-1">
                  <Button
                    variant={activeFamilyId ? "ghost" : "secondary"}
                    size="sm"
                    className="flex-1 justify-center gap-1 text-xs"
                    onClick={() => setActiveFamilyId(null)}
                  >
                    <CalendarIcon className="h-3 w-3" />
                    Personal
                  </Button>
                  {families.length > 0 ? (
                    <Select
                      value={activeFamilyId || ""}
                      onValueChange={(v) => setActiveFamilyId(v || null)}
                    >
                      <SelectTrigger
                        className={`flex-1 text-xs h-8 ${activeFamilyId ? "bg-secondary" : ""}`}
                      >
                        <Users className="h-3 w-3 mr-1" />
                        <SelectValue placeholder="Family" />
                      </SelectTrigger>
                      <SelectContent>
                        {families.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 justify-center gap-1 text-xs"
                      onClick={() => {
                        setFamilyModalTab("list");
                        setFamilyModalOpen(true);
                      }}
                    >
                      <Users className="h-3 w-3" />
                      Family
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => {
                      setFamilyModalTab("list");
                      setFamilyModalOpen(true);
                    }}
                    title="Manage families"
                  >
                    <Settings className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            <div className="p-3 border-b flex items-center justify-between relative">
              <div className="font-semibold">
                {activeFamilyId ? `${activeFamily?.name || "Family"} Calendars` : "Calendars"}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground flex items-center justify-center"
                  aria-label="Refresh events"
                  title={isRefreshing ? "Refreshing…" : "Refresh events"}
                  onClick={onRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                {status === "authenticated" && (
                  <div className="relative flex items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground flex items-center justify-center"
                      aria-label="Settings"
                      title="Settings"
                      onClick={() =>
                        setSettingsDropdownOpen(!settingsDropdownOpen)
                      }
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    {settingsDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setSettingsDropdownOpen(false)}
                          aria-hidden
                        />
                        <div className="absolute right-0 top-full mt-1 w-56 bg-card border rounded-md shadow-lg z-20 p-2 space-y-2">
                          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent p-2 rounded">
                            <input
                              type="checkbox"
                              className="accent-foreground"
                              checked={showDaysOfWeek}
                              onChange={(e) =>
                                setShowDaysOfWeek(e.target.checked)
                              }
                            />
                            <span>Show days of week</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent p-2 rounded">
                            <input
                              type="checkbox"
                              className="accent-foreground"
                              checked={alignWeekends}
                              onChange={(e) =>
                                setAlignWeekends(e.target.checked)
                              }
                            />
                            <span>Align weekends</span>
                          </label>
                          {hiddenEventIds.length > 0 && (
                            <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent p-2 rounded">
                              <input
                                type="checkbox"
                                className="accent-foreground"
                                checked={showHidden}
                                onChange={(e) =>
                                  setShowHidden(e.target.checked)
                                }
                              />
                              <span>Show hidden events</span>
                            </label>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-2 space-y-1">
              {status === "authenticated" ? (
                activeFamilyId ? (
                  // Family view: show shared calendars
                  <>
                    {familyCalendars.length > 0 ? (
                      familyCalendars.map((fc) => (
                        <div
                          key={fc.id}
                          className="flex items-center gap-2 text-sm p-2 rounded hover:bg-accent"
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: fc.color || "#cbd5e1" }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{fc.displayName || calendarNames[fc.calendarId] || "Calendar"}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              Shared by {fc.sharedBy.name || fc.sharedBy.email || "Unknown"}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground p-2">
                        No calendars shared yet. Share your calendars to see them here.
                      </div>
                    )}
                    <div className="px-2 py-3">
                      <Button
                        variant="outline"
                        className="w-full justify-center gap-2 rounded-full"
                        onClick={() => {
                          setFamilyModalTab("share");
                          setSelectedFamilyForManage(activeFamily);
                          setFamilyModalOpen(true);
                        }}
                      >
                        <Share2 className="h-4 w-4" />
                        <span>Share my calendars</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  // Personal view: show user's calendars
                  <>
                    {accountsWithCalendars.map(({ accountId, email, list }) => (
                      <div key={accountId || email} className="space-y-1">
                        <div className="px-2 pt-3 pb-1 flex items-center justify-between">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {email && email.length ? email : accountId || "Account"}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                            aria-label={`Disconnect ${email}`}
                            title={`Disconnect ${email}`}
                            onClick={() => {
                              disconnectAccount(accountId);
                            }}
                          >
                            <Unlink className="h-4 w-4" />
                          </Button>
                        </div>
                        {list.map((c) => {
                          const checked = selectedCalendarIds.includes(c.id);
                          return (
                            <div
                              key={c.id}
                              className="flex items-center gap-2 text-sm p-2 rounded hover:bg-accent"
                            >
                              <input
                                type="checkbox"
                                className="accent-foreground"
                                checked={checked}
                                onChange={(e) => {
                                  setSelectedCalendarIds((prev) =>
                                    e.target.checked
                                      ? [...prev, c.id]
                                      : prev.filter((id) => id !== c.id)
                                  );
                                }}
                              />
                              <span className="truncate flex-1">{c.summary}</span>
                              <input
                                type="color"
                                value={calendarColors[c.id] || "#cbd5e1"}
                                onChange={(e) => {
                                  const next = {
                                    ...calendarColors,
                                    [c.id]: e.target.value,
                                  };
                                  setCalendarColors(next);
                                }}
                                className="h-4 w-4 rounded-full border-0 p-0 cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                                style={{
                                  backgroundColor:
                                    calendarColors[c.id] || "#cbd5e1",
                                }}
                                aria-label={`Color for ${c.summary}`}
                                title={`Color for ${c.summary}`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {calendars.length === 0 && (
                      <div className="text-sm text-muted-foreground p-2">
                        No calendars
                      </div>
                    )}
                    <div className="px-2 py-3">
                      <Button
                        variant="outline"
                        className="w-full justify-center gap-2 rounded-full"
                        onClick={() => {
                          // Persist existing accountIds so we can auto-add the new account's calendars after linking
                          try {
                            const existing = Array.from(
                              new Set(accounts.map((a) => a.accountId))
                            ).filter(Boolean);
                            localStorage.setItem(
                              "preLinkAccountIds",
                              JSON.stringify(existing)
                            );
                          } catch {}
                          import("next-auth/react").then(({ signIn }) => {
                            const href = window.location.href;
                            const hasQuery = href.includes("?");
                            const callbackUrl = `${href}${
                              hasQuery ? "&" : "?"
                            }linkingAccount=1`;
                            signIn("google", { callbackUrl });
                          });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Google account</span>
                      </Button>
                    </div>
                  </>
                )
              ) : (
                <div className="text-sm text-muted-foreground p-2">
                  Sign in to manage calendars.
                </div>
              )}
            </div>
            <div className="p-3 border-t">
              {status === "authenticated" ? (
                <>
                  <Button
                    className="w-full justify-center gap-2 rounded-full"
                    variant="outline"
                    onClick={() => {
                      setSidebarOpen(false);
                      signOut();
                    }}
                  >
                    Sign out
                  </Button>
                  <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground mt-3">
                    <Link
                      href="/privacy"
                      className="hover:text-foreground transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      Privacy Policy
                    </Link>
                    <span>•</span>
                    <Link
                      href="/terms"
                      className="hover:text-foreground transition-colors"
                      onClick={() => setSidebarOpen(false)}
                    >
                      Terms of Service
                    </Link>
                  </div>
                </>
              ) : (
                <Button
                  className="w-full justify-center"
                  onClick={() => {
                    setSidebarOpen(false);
                    signIn("google");
                  }}
                >
                  Sign in with Google
                </Button>
              )}
            </div>
          </aside>
        </>
      )}
      <div className="flex-1 min-h-0">
        <YearCalendar
          year={year}
          events={visibleEvents}
          signedIn={status === "authenticated"}
          calendarColors={calendarColors}
          calendarNames={calendarNames}
          calendarAccounts={calendarAccounts}
          writableCalendars={writableCalendars}
          writableAccountsWithCalendars={writableAccountsWithCalendars}
          showDaysOfWeek={showDaysOfWeek}
          alignWeekends={alignWeekends}
          onDayClick={(dateKey) => {
            if (status === "authenticated") {
              createDateFromDayClick.current = dateKey;
              setCreateOpen(true);
            }
          }}
          onUpdateEvent={async (event) => {
            try {
              await fetch("/api/events", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: event.id,
                  title: event.title,
                  calendarId: event.calendarId,
                  startDate: event.startDate,
                  endDate: event.endDate,
                }),
              });
            } catch {}
            await onRefresh();
          }}
          onDeleteEvent={async (id) => {
            try {
              await fetch("/api/events", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              });
            } catch {}
            await onRefresh();
          }}
          onHideEvent={(id) => {
            setHiddenEventIds((prev) =>
              prev.includes(id) ? prev : [...prev, id]
            );
          }}
        />
      </div>
    </div>
  );
}
