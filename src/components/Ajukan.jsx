import ActionPage from "./ActionPage";
import React, { useEffect, useRef, useState } from "react";
import { fetchUserMapping } from "../services/mappingService";
import MonthSelector from "./MonthSelector";
import { notifyError } from "../utils/notifications";
import { getSkpMonthNumbers } from "../utils/skpPage";

const AjukanComponent = ({
  onSubmit,
  isLoading,
  formData,
  setFormData,
  message,
  onIdentityChange,
  mappingRevision,
}) => {
  console.log("🎯 [AJUKAN] Component rendered");
  const [bulanOptions, setBulanOptions] = useState([]);
  const [monthNumbers, setMonthNumbers] = useState(null);
  const [isLoadingBulan, setIsLoadingBulan] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const requestedMappingKey = useRef("");

  // Handler untuk perubahan User
  const handleUserChange = async (e) => {
    const username = e.target.value;
    const requestKey = `${formData.unit_a}\u0000${formData.kategori_a}\u0000${username}\u0000${mappingRevision}`;
    requestedMappingKey.current = requestKey;
    setMappingError("");
    setMonthNumbers(null);
    console.log("🔄 [AJUKAN] handleUserChange called with username:", username);

    setFormData((prev) => ({
      ...prev,
      user_a: username,
      bulan_a: "",
    }));
    onIdentityChange({
      unit: formData.unit_a,
      category: formData.kategori_a,
      user: username,
    });

    if (!username) {
      console.log("⚠️ [AJUKAN] No username provided, clearing options");
      setBulanOptions([]);
      return;
    }

    // Ambil mapping bulan
    console.log("📡 [AJUKAN] Starting GET_MAPPING request...");
    setIsLoadingBulan(true);
    try {
      const res = await fetchUserMapping({
        unit: formData.unit_a,
        category: formData.kategori_a,
        username,
      });
      if (requestedMappingKey.current !== requestKey) return;
      setMonthNumbers(getSkpMonthNumbers(res.period, res.year));

      // 🔍 LOG: Monitor GET_MAPPING API Response
      console.log("📡 [AJUKAN] GET_MAPPING API Response:", {
        success: res?.success,
        status: res?.status,
        hasRawResponse: !!res?.raw_response,
        rawResponseLength: res?.raw_response?.length || 0,
        hasIdSkp: !!res?.id_skp,
      });

      const isSuccess =
        res &&
        (res.success === true || res.status?.toLowerCase() === "success");

      if (isSuccess) {
        // Process raw response using JavaScript
        if (!res.raw_response) {
          console.error(
            "[AJUKAN] No raw_response found in API response. Response structure:",
            res,
          );
          setBulanOptions([
            { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
          ]);
          return;
        }

        console.log("🔍 [AJUKAN] Processing raw response...");
        const jsResult = processRawResponseJS(res.raw_response);
        console.log("✅ [AJUKAN] Parsing completed, result:", jsResult);

        // 📊 LOG: Monitor JavaScript Processing Results
        console.log("📊 [AJUKAN] JavaScript Processing Results:", {
          success: jsResult.success,
          hasIndikatorData: !!jsResult.indikatorData,
          indikatorDataLength: jsResult.indikatorData?.length || 0,
          hasPenilaiaanArr: !!jsResult.penilaiaanArr,
          penilaiaanArrLength: jsResult.penilaiaanArr?.length || 0,
          hasMappingIdPenilaiaan: !!jsResult.mappingIdPenilaiaan,
          mappingIdPenilaiaanKeys: jsResult.mappingIdPenilaiaan
            ? Object.keys(jsResult.mappingIdPenilaiaan)
            : [],
        });

        if (jsResult.success) {
          // Use JavaScript processed mappingIdPenilaiaan for dropdown population
          const idPenMap = jsResult.mappingIdPenilaiaan || {};
          const monthOrder = [
            "Januari",
            "Februari",
            "Maret",
            "April",
            "Mei",
            "Juni",
            "Juli",
            "Agustus",
            "September",
            "Oktober",
            "November",
            "Desember",
          ];

          // Ajukan should match Isi: only list months that have an id_penilaian
          const options = [];
          monthOrder.forEach((nm) => {
            const val = idPenMap[nm];
            if (val) {
              // skip months without id_penilaian atau tidak tahun 2026
              options.push({ value: val, label: nm });
            }
          });

          if (options.length === 0) {
            setBulanOptions([
              {
                value: "",
                label: "-- Tidak ada bulan yang dapat diajukan --",
                disabled: true,
              },
            ]);
          } else {
            setBulanOptions(options);
          }

          // Set values from minimal response
          const idskp = res.id_skp || "";
          setFormData((prev) => ({
            ...prev,
            id_skp_a: idskp,
          }));

        } else {
          console.error("JS processing failed:", jsResult);
          setBulanOptions([
            { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
          ]);
        }
      } else {
        // API request failed (sukses = false)
        console.warn("API request failed - sukses = false:", res);
        setBulanOptions([
          { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
        ]);
      }
    } catch (error) {
      if (requestedMappingKey.current !== requestKey) return;
      console.error("Error fetching mapping:", error);
      setMappingError(error.message || "Gagal mengambil data bulan.");
      setBulanOptions([
        { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
      ]);
    } finally {
      if (requestedMappingKey.current === requestKey) setIsLoadingBulan(false);
    }
  };

  const handleUserChangeRef = useRef(handleUserChange);
  handleUserChangeRef.current = handleUserChange;

  useEffect(() => {
    const identityKey = `${formData.unit_a}\u0000${formData.kategori_a}\u0000${formData.user_a}\u0000${mappingRevision}`;
    if (!formData.user_a) {
      requestedMappingKey.current = identityKey;
      setBulanOptions([]);
      setMonthNumbers(null);
      setMappingError("");
      setIsLoadingBulan(false);
      return;
    }
    if (requestedMappingKey.current === identityKey) return;

    requestedMappingKey.current = identityKey;
    handleUserChangeRef.current({ target: { value: formData.user_a } });
  }, [
    formData.kategori_a,
    formData.unit_a,
    formData.user_a,
    mappingRevision,
  ]);

  // Handler untuk perubahan Bulan
  const handleBulanChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      bulan_a: value,
    }));
  };

  // Handler untuk submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    const { bulan_a, id_skp_a, user_a } = formData;

    if (!bulan_a || !id_skp_a) {
      notifyError("Pilih user dan bulan (id_penilaian) terlebih dahulu");
      return;
    }

    // Send single numeric id_penilaian (as a plain value) instead of a JSON array
    const payload = {
      tupoksi: bulan_a, // id_penilaian
      bulan: "",
      id_skp: id_skp_a,
      username: user_a,
    };

    onSubmit(payload);
  };

  // Fungsi untuk memproses raw response (sama seperti di IsiComponent)
  const processRawResponseJS = (rawResponse) => {
    try {
      const currentYear = new Date().getFullYear();
      if (!rawResponse || typeof rawResponse !== "string") {
        console.error(
          "Raw response validation failed:",
          typeof rawResponse,
          rawResponse,
        );
        throw new Error(
          "Raw response is null, undefined, or not a string. Type: " +
            typeof rawResponse,
        );
      }

      // 🔍 LOG: Start raw response processing
      console.log("🔄 [AJUKAN] Starting raw response processing...", {
        responseLength: rawResponse.length,
      });

      // Processing raw response with JavaScript

      // Extract penilaiaan_indikator
      const indikatorMatch = rawResponse.match(
        /var\s+penilaiaan_indikator\s*=\s*(\[[\s\S]*?\]);/i,
      );
      let indikatorData = null;

      if (indikatorMatch) {
        try {
          indikatorData = JSON.parse(indikatorMatch[1]);

          // 📊 LOG: Extracted penilaiaan_indikator
          console.log("✅ [AJUKAN] Extracted penilaiaan_indikator:", {
            found: true,
            dataType: Array.isArray(indikatorData)
              ? "array"
              : typeof indikatorData,
            length: indikatorData?.length || 0,
            sampleItem: indikatorData?.[0]
              ? {
                  id: indikatorData[0].id,
                  indikator_kinerja:
                    indikatorData[0].indikator_kinerja?.substring(0, 50) +
                    "...",
                }
              : null,
          });
        } catch (e) {
          console.error("Error parsing indikator JSON:", e);
        }
      } else {
        console.warn("⚠️ [AJUKAN] No penilaiaan_indikator found in response");
      }

      // Extract penilaiaan
      const penilaiaanMatch = rawResponse.match(
        /var\s+penilaiaan\s*=\s*(\[[\s\S]*?\]);/i,
      );
      let penilaiaanArr = null;
      if (penilaiaanMatch) {
        try {
          penilaiaanArr = JSON.parse(penilaiaanMatch[1]);

          // 📊 LOG: Extracted penilaiaan
          console.log("✅ [AJUKAN] Extracted penilaiaan:", {
            found: true,
            dataType: Array.isArray(penilaiaanArr)
              ? "array"
              : typeof penilaiaanArr,
            length: penilaiaanArr?.length || 0,
            sampleItem: penilaiaanArr?.[0]
              ? {
                  id: penilaiaanArr[0].id,
                  bulan: penilaiaanArr[0].bulan,
                  status: penilaiaanArr[0].status,
                  tahun: penilaiaanArr[0].tahun,
                }
              : null,
          });
        } catch (e) {
          console.error("Error parsing penilaiaan JSON:", e);
        }
      } else {
        console.warn("No penilaiaan found in response");
      }

      // Mapping bulan
      const bulan = {
        1: "Januari",
        2: "Februari",
        3: "Maret",
        4: "April",
        5: "Mei",
        6: "Juni",
        7: "Juli",
        8: "Agustus",
        9: "September",
        10: "Oktober",
        11: "November",
        12: "Desember",
      };

      // Generate mapping id_penilaian seperti PHP
      let mappingIdPenilaiaan = {};
      if (Array.isArray(penilaiaanArr)) {
        penilaiaanArr.forEach((item) => {
          if (
            item.status === 0 &&
            item.tahun === currentYear &&
            item.bulan &&
            bulan[item.bulan]
          ) {
            const namaBulan = bulan[item.bulan];
            mappingIdPenilaiaan[namaBulan] = item.id;
          }
        });
      }

      // Filter penilaiaanArr untuk hanya tahun sekarang
      const filteredPenilaiaanArr = Array.isArray(penilaiaanArr)
        ? penilaiaanArr.filter((item) => item.tahun === currentYear)
        : [];

      const result = {
        indikatorData,
        penilaiaanArr: filteredPenilaiaanArr,
        mappingIdPenilaiaan,
        success: true,
      };

      // JavaScript processing completed

      return result;
    } catch (error) {
      console.error("JavaScript Processing Error:", error);
      return { success: false, error: error.message };
    }
  };

  const monthLabel = formData.bulan_a
    ? (bulanOptions.find((option) => String(option.value) === String(formData.bulan_a))?.label || "").split(" - ")[0]
    : "";

  return (
    <ActionPage
      icon="fa-paper-plane"
      title="Kirim Rencana Aksi"
      subtitle="Hanya menampilkan rencana aksi yang sudah diisi lengkap."
      steps={["Pengguna", "Bulan", "Proses"]}
      hasUser={Boolean(formData.user_a)}
      monthLabel={monthLabel}
      canSubmit={Boolean(formData.user_a && formData.bulan_a)}
      isSubmitting={isLoading}
      onSubmit={handleSubmit}
      action={{ label: "Kirim Rencana Aksi", busyLabel: "Mengirim...", icon: "fa-paper-plane", variant: "success" }}
      confirm={{ title: "Kirim rencana aksi?", body: "Rencana aksi akan diajukan dan tidak dapat diubah selama menunggu penilaian." }}
      mappingError={mappingError}
      onRetry={() =>
        handleUserChangeRef.current({ target: { value: formData.user_a } })
      }
      message={message}
      monthSelector={
        <MonthSelector
          key={formData.user_a}
          id="bulan_a"
          options={bulanOptions}
          disabled={!formData.user_a}
          isLoading={isLoadingBulan}
          monthNumbers={monthNumbers}
          value={formData.bulan_a || ""}
          onChange={handleBulanChange}
        />
      }
    ></ActionPage>
  );
};


export default AjukanComponent;
