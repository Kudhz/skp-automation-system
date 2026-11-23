import ActionPage from "./ActionPage";
import React, { useEffect, useRef, useState } from "react";
import { fetchUserMapping } from "../services/mappingService";
import MonthSelector from "./MonthSelector";
import { getSkpMonthNumbers } from "../utils/skpPage";
import { compareWithPreviousMonth } from "../utils/previewComparison";

const PreviewComponent = ({
  formData,
  setFormData,
  onIdentityChange,
  mappingRevision,
}) => {
  const [bulanOptions, setBulanOptions] = useState([]);
  const [monthNumbers, setMonthNumbers] = useState(null);
  const [isLoadingBulan, setIsLoadingBulan] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewBulanData, setPreviewBulanData] = useState({});
  const [previewJSResult, setPreviewJSResult] = useState(null);
  const requestedMappingKey = useRef("");

  // Handler untuk perubahan User
  const handleUserChange = async (e) => {
    const username = e.target.value;
    const requestKey = `${formData.unit_p}\u0000${formData.kategori_p}\u0000${username}\u0000${mappingRevision}`;
    requestedMappingKey.current = requestKey;
    setMappingError("");
    setMonthNumbers(null);
    console.log(
      "🔄 [PREVIEW] handleUserChange called with username:",
      username,
    );

    setFormData((prev) => ({
      ...prev,
      user_p: username,
      bulan_p: "",
    }));
    onIdentityChange({
      unit: formData.unit_p,
      category: formData.kategori_p,
      user: username,
    });

    // Reset preview data
    setPreviewBulanData({});
    setPreviewJSResult(null);
    setShowPreview(false);

    if (!username) {
      setBulanOptions([]);
      return;
    }

    // Ambil mapping bulan
    setIsLoadingBulan(true);
    try {
      const res = await fetchUserMapping({
        unit: formData.unit_p,
        category: formData.kategori_p,
        username,
      });
      if (requestedMappingKey.current !== requestKey) return;
      setMonthNumbers(getSkpMonthNumbers(res.period, res.year));

      // 🔍 LOG: Monitor GET_MAPPING API Response
      console.log("📡 [PREVIEW] GET_MAPPING API Response:", {
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
          console.error("[PREVIEW] No raw_response found in API response");
          setBulanOptions([
            {
              value: "",
              label: "❌ Raw response tidak tersedia",
              disabled: true,
            },
          ]);
          return;
        }

        console.log("🔍 [PREVIEW] Processing raw response...");
        const jsResult = processRawResponseJS(res.raw_response, res.year);
        jsResult.period = res.period;

        // 📊 LOG: Monitor JavaScript Processing Results
        console.log("📊 [PREVIEW] JavaScript Processing Results:", {
          success: jsResult.success,
          hasIndikatorData: !!jsResult.indikatorData,
          indikatorDataLength: jsResult.indikatorData?.length || 0,
          hasPenilaiaanArr: !!jsResult.penilaiaanArr,
          penilaiaanArrLength: jsResult.penilaiaanArr?.length || 0,
          hasRhkIndikator: !!jsResult.rhkIndikator,
          rhkIndikatorLength: jsResult.rhkIndikator?.length || 0,
          jumlahUnikIndikatorKinerja: jsResult.jumlahUnikIndikatorKinerja || 0,
          mappingTupoksiLength: jsResult.mappingTupoksi?.length || 0,
          hasMappingBulanId: !!jsResult.mappingBulanId,
          mappingBulanIdKeys: jsResult.mappingBulanId
            ? Object.keys(jsResult.mappingBulanId)
            : [],
          renaksiBulanIdLength: jsResult.renaksiBulanId?.length || 0,
          buktiDukung: jsResult.buktiDukung || "N/A",
        });

        if (jsResult.success && jsResult.mappingBulanId) {
          // Populate dropdown dengan semua bulan yang tersedia (sudah diisi, belum diisi, dll)
          const options = [];
          console.log(
            "📅 [PREVIEW] Available months for preview:",
            Object.keys(jsResult.mappingBulanId),
          );

          const tempBulanData = {};
          for (let bulanLabel in jsResult.mappingBulanId) {
            const ids = jsResult.mappingBulanId[bulanLabel];
            if (!Array.isArray(ids) || ids.length === 0) {
              console.warn(
                "⚠️ Skipping month with invalid IDs:",
                bulanLabel,
                ids,
              );
              continue;
            }

            // Create data object and store in a simpler format
            const bulanData = {
              ids: ids,
              label: bulanLabel,
            };

            // Use a simpler approach - store data in a global object and use index as value
            const dataKey = "month_" + Object.keys(tempBulanData).length;
            tempBulanData[dataKey] = bulanData;

            console.log("📝 [PREVIEW] Adding month option:", {
              bulanLabel,
              dataKey,
            });

            options.push({
              value: dataKey,
              label: bulanLabel,
              disabled: false,
            });
          }

          if (options.length === 0) {
            setBulanOptions([
              {
                value: "",
                label: "-- Tidak ada data bulan tersedia --",
                disabled: true,
              },
            ]);
          } else {
            setBulanOptions(options);
          }

          setPreviewBulanData(tempBulanData);
        } else {
          console.error(
            "[PREVIEW] JS processing failed or no mapping data:",
            jsResult,
          );
          setBulanOptions([
            {
              value: "",
              label: "❌ JavaScript processing gagal",
              disabled: true,
            },
          ]);
        }

        // Store JS results untuk digunakan saat preview
        setPreviewJSResult(jsResult);

        // 🎯 LOG: Detailed preview data monitoring
        if (jsResult && jsResult.success) {
          console.log("🎯 [PREVIEW] === RENAKSI DATA SIAP ===");
          console.log("📊 [PREVIEW] Summary Data Preview:", {
            jumlahIndikatorKinerjaUnik:
              jsResult.jumlahUnikIndikatorKinerja || 0,
            jumlahMappingTupoksi: jsResult.mappingTupoksi
              ? jsResult.mappingTupoksi.length
              : 0,
            jumlahMappingBulan: jsResult.mappingBulanId
              ? Object.keys(jsResult.mappingBulanId).length
              : 0,
            jumlahRenaksiData: jsResult.renaksiBulanId
              ? jsResult.renaksiBulanId.length
              : 0,
            mappingBulanKeys: jsResult.mappingBulanId
              ? Object.keys(jsResult.mappingBulanId).slice(0, 5)
              : [],
            sampleTupoksi: jsResult.mappingTupoksi
              ? jsResult.mappingTupoksi.slice(0, 5)
              : [],
            sampleRenaksi: jsResult.renaksiBulanId
              ? jsResult.renaksiBulanId.slice(0, 3)
              : [],
          });
          console.log("🎯 [PREVIEW] === END RENAKSI DATA ===");
        }
      } else {
        setBulanOptions([
          { value: "", label: "❌ Gagal ambil data", disabled: true },
        ]);
      }
    } catch (error) {
      if (requestedMappingKey.current !== requestKey) return;
      console.error("Error fetching mapping:", error);
      setMappingError(error.message || "Gagal mengambil data bulan.");
      setBulanOptions([
        { value: "", label: "❌ Gagal ambil data", disabled: true },
      ]);
    } finally {
      if (requestedMappingKey.current === requestKey) setIsLoadingBulan(false);
    }
  };

  const handleUserChangeRef = useRef(handleUserChange);
  handleUserChangeRef.current = handleUserChange;

  useEffect(() => {
    const identityKey = `${formData.unit_p}\u0000${formData.kategori_p}\u0000${formData.user_p}\u0000${mappingRevision}`;
    if (!formData.user_p) {
      requestedMappingKey.current = identityKey;
      setBulanOptions([]);
      setMonthNumbers(null);
      setMappingError("");
      setIsLoadingBulan(false);
      setShowPreview(false);
      return;
    }
    if (requestedMappingKey.current === identityKey) return;

    requestedMappingKey.current = identityKey;
    handleUserChangeRef.current({ target: { value: formData.user_p } });
  }, [
    formData.kategori_p,
    formData.unit_p,
    formData.user_p,
    mappingRevision,
  ]);

  // Handler untuk perubahan Bulan
  const handleBulanChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      bulan_p: value,
    }));
    setPreviewError("");

    // Jika preview sudah ditampilkan dan user berubah, sembunyikan preview lama
    if (showPreview) {
      setShowPreview(false);
      console.log(
        'Pilihan bulan berubah. Klik "Tampilkan Preview" untuk melihat data terbaru.',
      );
    }
  };

  // Handler untuk tampilkan preview
  const handleShowPreview = (e) => {
    e.preventDefault();

    const bulanVal = formData.bulan_p;
    if (!bulanVal) {
      setPreviewError("Pilih bulan terlebih dahulu.");
      return;
    }

    setIsLoadingPreview(true);
    setPreviewError("");

    console.log("🔍 Preview button clicked. Bulan value:", bulanVal);

    try {
      let bulanData = null;
      let selectedIds = [];
      let bulanLabel = "";

      // Check if using new format (data key)
      if (
        bulanVal.startsWith("month_") &&
        previewBulanData &&
        previewBulanData[bulanVal]
      ) {
        bulanData = previewBulanData[bulanVal];
        selectedIds = bulanData.ids || [];
        bulanLabel = bulanData.label || "Unknown";
        console.log("✅ Using stored data:", bulanData);
      } else {
        // Fallback to old JSON parsing
        const decodedVal = bulanVal
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        console.log("📝 Trying to decode as JSON:", decodedVal);

        try {
          bulanData = JSON.parse(decodedVal);
          selectedIds = bulanData.ids || [];
          bulanLabel = bulanData.label || "Unknown";
          console.log("✅ Parsed as JSON:", bulanData);
        } catch {
          console.log("⚠️ JSON parsing failed, using fallback");
          selectedIds = [bulanVal];
          bulanLabel =
            bulanOptions.find((opt) => opt.value === bulanVal)?.label ||
            "Unknown";
        }
      }

      if (!previewJSResult) {
        throw new Error("Data belum tersedia. Pilih pengguna terlebih dahulu.");
      }

      console.log(
        "📊 Processing preview with IDs:",
        selectedIds,
        "Label:",
        bulanLabel,
      );

      const generatedPreview = generatePreviewContent(
        selectedIds,
        bulanLabel,
        previewJSResult,
      );
      if (generatedPreview.previewData.length > 0) {
        generatedPreview.comparison = compareWithPreviousMonth(
          generatedPreview.previewData,
          previewJSResult.penilaiaanArr,
          previewJSResult.indikatorData,
          previewJSResult.period?.startDate,
        );
      }
      setPreviewData(generatedPreview);
      setShowPreview(true);
    } catch (error) {
      console.error("Error processing preview:", error);
      setPreviewError(error.message || "Gagal memproses preview.");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Function to generate preview content
  const generatePreviewContent = (selectedIds, bulanLabel, jsResult) => {
    // 🔍 LOG: Monitor preview content generation
    console.log("🎬 [PREVIEW] === GENERATE CONTENT ===");
    console.log("🎬 [PREVIEW] Generating preview content:", {
      bulanLabel,
      selectedIdsLength: selectedIds.length,
      sampleIds: selectedIds.slice(0, 5),
      hasMoreIds: selectedIds.length > 5,
      additionalIds: selectedIds.length > 5 ? selectedIds.length - 5 : 0,
      hasJsResult: !!jsResult,
      totalRenaksiData: jsResult?.renaksiBulanId?.length || 0,
      totalMappingTupoksi: jsResult?.mappingTupoksi?.length || 0,
    });
    console.log("🎬 [PREVIEW] =======================================");

    try {
      // Validate inputs
      if (!Array.isArray(selectedIds)) {
        throw new Error("selectedIds is not an array: " + typeof selectedIds);
      }

      if (!jsResult || !jsResult.indikatorData) {
        throw new Error("Invalid jsResult or missing indikatorData");
      }

      // Find matching data from JS results
      const previewData = [];
      if (jsResult.indikatorData && Array.isArray(jsResult.indikatorData)) {
        console.log(
          "🔍 Searching through",
          jsResult.indikatorData.length,
          "indikator items",
        );

        selectedIds.forEach((id) => {
          const matchingItem = jsResult.indikatorData.find((item) => {
            return item.id == id || item.id === id;
          });
          if (matchingItem) {
            previewData.push(matchingItem);
            console.log(
              "✅ Found matching item for ID",
              id,
              ":",
              matchingItem.indikator_kinerja,
            );
          } else {
            console.warn("⚠️ No matching item found for ID:", id);
          }
        });
      } else {
        console.error("❌ indikatorData is not available or not an array");
      }

      console.log("📊 Preview data collected:", previewData.length, "items");

      if (previewData.length > 0) {
        // Summary statistics with better styling
        const itemsWithRealisasi = previewData.filter(
          (item) => (parseFloat(item.realisasi) || 0) > 0,
        ).length;
        const itemsWithRenaksi = previewData.filter(
          (item) => item.renaksi && item.renaksi !== "Belum diisi",
        ).length;

        // Determine month status based on mapping bulan logic
        const statusValues = previewData.map((item) => item.status || 0);
        const maxStatus = Math.max(...statusValues);

        let monthStatus, monthStatusClass, monthStatusIcon;
        if (maxStatus === 2 || statusValues.includes(2)) {
          monthStatus = "Sudah Di Nilai";
          monthStatusClass = "bg-success";
          monthStatusIcon = "fas fa-award";
        } else if (maxStatus === 1 || statusValues.includes(1)) {
          monthStatus = "Sudah di Ajukan";
          monthStatusClass = "bg-info";
          monthStatusIcon = "fas fa-paper-plane";
        } else {
          // Status 0 - check realisasi for more detailed status
          const hasRealisasi = previewData.some(
            (item) => (parseFloat(item.realisasi) || 0) > 0,
          );
          if (hasRealisasi) {
            monthStatus = "Sudah diisi";
            monthStatusClass = "bg-primary";
            monthStatusIcon = "fas fa-edit";
          } else {
            monthStatus = "Belum diisi";
            monthStatusClass = "bg-warning";
            monthStatusIcon = "fas fa-clock";
          }
        }

        return {
          bulanLabel,
          previewData,
          itemsWithRealisasi,
          itemsWithRenaksi,
          monthStatus,
          monthStatusClass,
          monthStatusIcon,
        };
      } else {
        return {
          bulanLabel,
          previewData: [],
          error:
            "Tidak ditemukan data indikator untuk bulan ini. IDs yang dicari: " +
            selectedIds.join(", "),
        };
      }
    } catch (error) {
      console.error("❌ Error in generatePreviewContent:", error);
      throw error;
    }
  };

  // Fungsi untuk memproses raw response (sama seperti di komponen lain)
  const processRawResponseJS = (rawResponse, currentYear) => {
    try {
      if (!rawResponse || typeof rawResponse !== "string") {
        throw new Error("Raw response is null, undefined, or not a string");
      }

      // 🔍 LOG: Start raw response processing
      console.log("� [PREVIEW] Starting raw response processing...", {
        responseLength: rawResponse.length,
      });

      // Extract penilaiaan_indikator
      const indikatorMatch = rawResponse.match(
        /var\s+penilaiaan_indikator\s*=\s*(\[[\s\S]*?\]);/i,
      );
      let indikatorData = null;
      let jumlahUnikIndikatorKinerja = 0;

      if (indikatorMatch) {
        try {
          indikatorData = JSON.parse(indikatorMatch[1]);
          console.log(
            "✅ Found indikator data:",
            indikatorData.length,
            "items",
          );

          // Ambil semua id_indikator
          const allIndikatorKinerja = [];
          if (Array.isArray(indikatorData)) {
            indikatorData.forEach((item) => {
              if (item.id_indikator) {
                allIndikatorKinerja.push(item.id_indikator);
              }
            });
          }

          // Hitung jumlah unik
          const uniqueIndikatorKinerja = [...new Set(allIndikatorKinerja)];
          jumlahUnikIndikatorKinerja = uniqueIndikatorKinerja.length;
        } catch (e) {
          console.error("❌ Error parsing indikator JSON:", e);
        }
      }

      // Extract penilaiaan
      const penilaiaanMatch = rawResponse.match(
        /var\s+penilaiaan\s*=\s*(\[[\s\S]*?\]);/i,
      );
      let penilaiaanArr = null;
      if (penilaiaanMatch) {
        try {
          penilaiaanArr = JSON.parse(penilaiaanMatch[1]);
          console.log(
            "✅ Found penilaiaan data:",
            penilaiaanArr.length,
            "items",
          );
        } catch (e) {
          console.error("❌ Error parsing penilaiaan JSON:", e);
        }
      }

      // Extract rkh_indikator
      const rhkMatch = rawResponse.match(
        /var\s+rkh_indikator\s*=\s*(\[[\s\S]*?\]);/i,
      );
      let rhkIndikator = null;
      let mappingTupoksi = [];
      if (rhkMatch) {
        try {
          rhkIndikator = JSON.parse(rhkMatch[1]);
          console.log(
            "✅ Found RHK indikator data:",
            rhkIndikator.length,
            "items",
          );
          if (Array.isArray(rhkIndikator)) {
            rhkIndikator.forEach((item) => {
              if (item.id_indikator) {
                mappingTupoksi.push(item.id_indikator);
              }
            });
          }
        } catch (e) {
          console.error("❌ Error parsing RHK JSON:", e);
        }
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

      // Process mapping bulan dengan status
      let mappingBulanId = {};
      let mappingBulanIdIndikator = {};
      if (Array.isArray(penilaiaanArr) && Array.isArray(indikatorData)) {
        const bulanLookup = {};
        const statusLookup = {};

        penilaiaanArr.forEach((item) => {
          if (
            item.tahun == currentYear &&
            item.id &&
            item.bulan !== undefined &&
            item.status !== undefined &&
            [0, 1, 2].includes(item.status)
          ) {
            bulanLookup[item.id] = item.bulan;
            statusLookup[item.id] = item.status;
          }
        });

        indikatorData.forEach((ind) => {
          if (!ind.id || !ind.id_penilaiaan || !ind.id_indikator) return;

          const id = ind.id;
          const id_penilaiaan = ind.id_penilaiaan;
          const id_indikator = ind.id_indikator;
          const realisasi = ind.realisasi || 0;

          if (!bulanLookup[id_penilaiaan]) return;

          const bulan_num = parseInt(bulanLookup[id_penilaiaan]);
          if (!bulan[bulan_num]) return;

          const namaBulan = bulan[bulan_num];
          const status = statusLookup[id_penilaiaan];

          let label = namaBulan;
          if (status === 1) {
            label += " - Sudah di Ajukan";
          } else if (status === 2) {
            label += " - Sudah Di Nilai";
          } else if (status === 0) {
            if (realisasi == 0) {
              label += " - Belum diisi";
            } else {
              label += " - Sudah diisi";
            }
          }

          if (!mappingBulanId[label]) {
            mappingBulanId[label] = [];
            mappingBulanIdIndikator[label] = [];
          }
          mappingBulanId[label].push(id);
          mappingBulanIdIndikator[label].push(id_indikator);
        });
      }

      // Extract renaksi data
      const renaksiBulanId = [];
      if (Array.isArray(indikatorData)) {
        const renaksiByIdIndikator = {};

        indikatorData.forEach((item) => {
          if (item.id_indikator && item.renaksi && item.id) {
            renaksiByIdIndikator[item.id_indikator] = item.renaksi;
          }
        });

        mappingTupoksi.forEach((idIndikator) => {
          if (renaksiByIdIndikator[idIndikator]) {
            renaksiBulanId.push(renaksiByIdIndikator[idIndikator]);
          } else {
            renaksiBulanId.push("");
          }
        });
      }

      return {
        indikatorData,
        penilaiaanArr,
        rhkIndikator,
        jumlahUnikIndikatorKinerja,
        mappingTupoksi,
        mappingBulanId,
        mappingBulanIdIndikator,
        renaksiBulanId,
        success: true,
      };
    } catch (error) {
      console.error("❌ JavaScript Processing Error:", error);
      return { success: false, error: error.message };
    }
  };

  const monthLabel = formData.bulan_p
    ? (bulanOptions.find((option) => String(option.value) === String(formData.bulan_p))?.label || "").split(" - ")[0]
    : "";

  return (
    <ActionPage
      icon="fa-eye"
      title="Preview Isi Renaksi"
      subtitle="Lihat detail rencana aksi yang sudah diisi berdasarkan bulan."
      steps={["Pengguna", "Bulan", "Proses"]}
      hasUser={Boolean(formData.user_p)}
      monthLabel={monthLabel}
      canSubmit={Boolean(formData.user_p && formData.bulan_p)}
      isSubmitting={isLoadingPreview}
      onSubmit={handleShowPreview}
      action={{ label: "Tampilkan Preview", busyLabel: "Memuat preview...", icon: "fa-eye", variant: "primary" }}
      confirm={null}
      mappingError={mappingError}
      onRetry={() =>
        handleUserChangeRef.current({ target: { value: formData.user_p } })
      }
      message={null}
      monthSelector={
        <MonthSelector
          key={formData.user_p}
          id="bulan_p"
          options={bulanOptions}
          disabled={!formData.user_p}
          isLoading={isLoadingBulan}
          monthNumbers={monthNumbers}
          value={formData.bulan_p || ""}
          onChange={handleBulanChange}
        />
      }
    >
      {previewError && (
        <div className="saas-alert saas-alert-danger" role="alert">
          <div className="saas-alert-content">
            <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <span>{previewError}</span>
          </div>
        </div>
      )}

      {showPreview && previewData && (
        <section className="preview-result" aria-labelledby="preview-result-title">
          <header className="preview-result-header">
            <div>
              <span className="preview-result-eyebrow">HASIL PREVIEW</span>
              <h3 id="preview-result-title">Rencana Aksi</h3>
              <p>{previewData.bulanLabel || "Bulan tidak tersedia"} · {previewData.previewData.length} indikator</p>
            </div>
            <button
              type="button"
              className="preview-close"
              aria-label="Tutup hasil preview"
              onClick={() => setShowPreview(false)}
            >
              <i className="fas fa-times" aria-hidden="true"></i>
            </button>
          </header>
          <div id="preview-content" className="preview-result-body">
            {previewData.error ? (
              <div className="saas-alert saas-alert-warning saas-alert-block" role="alert">
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <div className="saas-alert-details">
                  <strong>Tidak ada data</strong>
                  <p>{previewData.error}</p>
                </div>
              </div>
            ) : previewData.previewData.length > 0 ? (
              <>
                <div className="preview-summary" aria-label="Ringkasan preview">
                  <div className="preview-summary-item">
                    <span>Status bulan</span>
                    <strong><i className={previewData.monthStatusIcon} aria-hidden="true"></i>{previewData.monthStatus}</strong>
                  </div>
                  <div className="preview-summary-item">
                    <span>Sudah diisi</span>
                    <strong>{previewData.itemsWithRealisasi} / {previewData.previewData.length}</strong>
                  </div>
                  <div className="preview-summary-item">
                    <span>Ada rencana aksi</span>
                    <strong>{previewData.itemsWithRenaksi} / {previewData.previewData.length}</strong>
                  </div>
                </div>

                {previewData.comparison && (
                  <section className="preview-comparison" aria-label="Perbandingan bulan sebelumnya">
                    <div>
                      <strong>Perbandingan bulan sebelumnya</strong>
                      <p>{previewData.comparison.hasReference
                        ? `Acuan: ${previewData.comparison.monthLabel} ${previewData.comparison.year}. Berdasarkan teks rencana aksi indikator yang ditampilkan.`
                        : "Bulan yang dipilih tidak memiliki bulan acuan sebelumnya dalam periode SKP."}</p>
                    </div>
                    <div className="preview-comparison-counts">
                      <span className="preview-comparison-badge same">Sama: {previewData.comparison.results.filter((result) => result === "same").length}</span>
                      <span className="preview-comparison-badge different">Berbeda: {previewData.comparison.results.filter((result) => result === "different").length}</span>
                      <span className="preview-comparison-badge unavailable">Belum dapat dibandingkan: {previewData.comparison.results.filter((result) => result === "unavailable").length}</span>
                    </div>
                  </section>
                )}

                <div className="preview-detail-heading">
                  <h4>Detail Indikator</h4>
                  <span>{previewData.previewData.length} indikator</span>
                </div>
                <div className="table-responsive preview-table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th scope="col">No</th>
                        <th scope="col">Indikator Kinerja</th>
                        <th scope="col">Rencana Aksi</th>
                        <th scope="col">Bulan Sebelumnya</th>
                        <th scope="col">Realisasi</th>
                        <th scope="col">Bukti Dukung</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.previewData.map((item, index) => {
                        const realisasi = item.realisasi || 0;
                        const renaksi = item.renaksi || "Belum diisi";
                        const indikator = item.indikator_kinerja || "N/A";
                        const buktiDukung = item.bukti_dukung || "Belum ada";
                        const comparison = previewData.comparison?.results[index] || "unavailable";
                        const comparisonLabel = {
                          same: "Sama",
                          different: "Berbeda",
                          unavailable: "Belum dapat dibandingkan",
                        }[comparison];

                        let statusClass = "empty";
                        let statusIcon = "fa-clock";
                        let statusText = "Belum ada";
                        if ((parseFloat(realisasi) || 0) > 0) {
                          statusClass = "filled";
                          statusIcon = "fa-check";
                          statusText = "Sudah diisi";
                        } else if (renaksi && renaksi !== "Belum diisi") {
                          statusClass = "plan";
                          statusIcon = "fa-file-lines";
                          statusText = "Renaksi ada";
                        }

                        return (
                          <tr key={index}>
                            <td data-label="Nomor" className="preview-row-number">{index + 1}</td>
                            <td data-label="Indikator Kinerja"><div className="text-content preview-indicator">{indikator}</div></td>
                            <td data-label="Rencana Aksi"><div className="text-content">{renaksi}</div></td>
                            <td data-label="Perbandingan Bulan Sebelumnya" className="preview-row-comparison">
                              <span className={`preview-comparison-badge ${comparison}`}>{comparisonLabel}</span>
                            </td>
                            <td data-label="Realisasi">{realisasi}</td>
                            <td data-label="Bukti Dukung"><div className="text-content">{buktiDukung}</div></td>
                            <td data-label="Status" className="preview-row-status">
                              <span className={`preview-status ${statusClass}`} role="img" aria-label={statusText} title={statusText}>
                                <i className={`fas ${statusIcon}`} aria-hidden="true"></i>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="saas-alert saas-alert-warning saas-alert-block" role="alert">
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <div className="saas-alert-details">
                  <strong>Tidak ada data</strong>
                  <p>Tidak ditemukan data untuk bulan yang dipilih.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </ActionPage>
  );
};


export default PreviewComponent;
