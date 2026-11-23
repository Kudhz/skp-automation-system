import ActionPage from "./ActionPage";
import React, { useEffect, useRef, useState } from "react";
import { fetchUserMapping } from "../services/mappingService";
import MonthSelector from "./MonthSelector";
import { getMonthIndicatorMappings } from "../utils/monthOptions";
import { getSkpMonthNumbers } from "../utils/skpPage";

const IsiComponent = ({
  onSubmit,
  isLoading,
  formData,
  setFormData,
  message,
  onIdentityChange,
  mappingRevision,
}) => {
  const [bulanOptions, setBulanOptions] = useState([]);
  const [monthNumbers, setMonthNumbers] = useState(null);
  const [isLoadingBulan, setIsLoadingBulan] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const requestedMappingKey = useRef("");

  // Handler untuk perubahan User
  const handleUserChange = async (e) => {
    const username = e.target.value;
    const requestKey = `${formData.unit}\u0000${formData.kategori}\u0000${username}\u0000${mappingRevision}`;
    requestedMappingKey.current = requestKey;
    setMappingError("");
    setMonthNumbers(null);
    console.log("🔄 [ISI] handleUserChange called with username:", username);

    setFormData((prev) => ({
      ...prev,
      user: username,
      bulan: "",
    }));
    onIdentityChange({
      unit: formData.unit,
      category: formData.kategori,
      user: username,
    });

    if (!username) {
      console.log("⚠️ [ISI] No username provided, clearing options");
      setBulanOptions([]);
      return;
    }

    // Ambil mapping bulan
    setIsLoadingBulan(true);
    try {
      const res = await fetchUserMapping({
        unit: formData.unit,
        category: formData.kategori,
        username,
      });
      if (requestedMappingKey.current !== requestKey) return;
      setMonthNumbers(getSkpMonthNumbers(res.period, res.year));

      const isSuccess =
        res &&
        (res.success === true || res.status?.toLowerCase() === "success");

      if (isSuccess) {
        // Process raw response dengan JavaScript
        if (res.raw_response) {
          const jsResult = processRawResponseJS(res.raw_response);
          console.log("✅ [ISI] Parsing completed, result:", jsResult);

          if (jsResult.success) {
            // Populate bulan dropdown dari JavaScript result
            const options = [];
            if (jsResult.mappingBulanId) {
              for (let bulan in jsResult.mappingBulanId) {
                const canSelect =
                  bulan.includes("Sudah diisi") ||
                  bulan.includes("Belum diisi");

                // Buat array id yang diurutkan sesuai dengan mappingTupoksi
                const bulanIds = jsResult.mappingBulanId[bulan];
                const bulanIdIndikators =
                  jsResult.mappingBulanIdIndikator[bulan];

                let orderedIds = [];
                let orderedPlans = [];
                if (jsResult.mappingTupoksi && bulanIdIndikators) {
                  jsResult.mappingTupoksi.forEach((idIndikator, planIndex) => {
                    const index = bulanIdIndikators.indexOf(idIndikator);
                    if (index !== -1 && bulanIds[index]) {
                      orderedIds.push(bulanIds[index]);
                      orderedPlans.push(jsResult.renaksiBulanId[planIndex] || "");
                    }
                  });
                }

                options.push({
                  value: JSON.stringify(orderedIds),
                  label: bulan,
                  disabled: !canSelect,
                  plans: orderedPlans,
                });
              }
            }
            setBulanOptions(options);

            // Set hidden inputs dari JavaScript result
            setFormData((prev) => ({
              ...prev,
              jumlahUnikIndikatorKinerja:
                jsResult.jumlahUnikIndikatorKinerja || "",
              bukti_dukung: jsResult.buktiDukung || "",
              rhk: jsResult.renaksiBulanId
                ? JSON.stringify(jsResult.renaksiBulanId)
                : "",
            }));
          } else {
            setBulanOptions([
              { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
            ]);
          }
        } else {
          setBulanOptions([
            { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
          ]);
        }
      } else {
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
    const identityKey = `${formData.unit}\u0000${formData.kategori}\u0000${formData.user}\u0000${mappingRevision}`;
    if (!formData.user) {
      requestedMappingKey.current = identityKey;
      setBulanOptions([]);
      setMonthNumbers(null);
      setMappingError("");
      setIsLoadingBulan(false);
      return;
    }
    if (requestedMappingKey.current === identityKey) return;

    requestedMappingKey.current = identityKey;
    handleUserChangeRef.current({ target: { value: formData.user } });
  }, [formData.kategori, formData.unit, formData.user, mappingRevision]);

  // Handler untuk perubahan Bulan
  const handleBulanChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      bulan: value,
    }));
  };

  // Handler untuk submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    const selectedOption = bulanOptions.find(
      (option) => option.value === formData.bulan && !option.disabled,
    );
    if (!selectedOption?.plans?.length) {
      setMappingError("Data RHK untuk bulan ini tidak tersedia. Muat ulang data pengguna.");
      return;
    }

    const payload = new FormData();
    payload.append(
      "jumlahUnikIndikatorKinerja",
      String(selectedOption.plans.length),
    );
    payload.append("bukti_dukung", formData.bukti_dukung || "");
    payload.append("rhk", JSON.stringify(selectedOption.plans));
    payload.append("username", formData.user);
    payload.append("id_indikator", formData.bulan);

    onSubmit(payload);
  };

  // Fungsi untuk memproses raw response (sama seperti di PHP)
  const processRawResponseJS = (rawResponse) => {
    try {
      const currentYear = new Date().getFullYear();
      // Validasi input
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
      // Extract penilaiaan_indikator
      const indikatorMatch = rawResponse.match(
        /var\s+penilaiaan_indikator\s*=\s*(\[[\s\S]*?\]);/i,
      );
      let indikatorData = null;
      let jumlahUnikIndikatorKinerja = 0;

      if (indikatorMatch) {
        try {
          indikatorData = JSON.parse(indikatorMatch[1]);

          // 📊 LOG: Extracted penilaiaan_indikator

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

          // 📊 LOG: Processed indikator data
        } catch (e) {
          console.error("Error parsing indikator JSON:", e);
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

          // 📊 LOG: Extracted penilaiaan
        } catch (e) {
          console.error("Error parsing penilaiaan JSON:", e);
        }
      } else {
        console.warn("⚠️ [ISI] No penilaiaan found in response");
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
          if (Array.isArray(rhkIndikator)) {
            rhkIndikator.forEach((item) => {
              if (item.id_indikator) {
                mappingTupoksi.push(item.id_indikator);
              }
            });
          }
        } catch (e) {
          console.error("Error parsing RHK JSON:", e);
        }
      } else {
        console.warn("⚠️ [ISI] No rkh_indikator found in response");
      }

      const { mappingBulanId, mappingBulanIdIndikator } =
        getMonthIndicatorMappings(penilaiaanArr, indikatorData, currentYear);

      // Extract renaksi data - DIURUTKAN BERDASARKAN urutan dalam mappingBulanId
      const renaksiBulanId = [];
      const renaksiOrderMap = {}; // Map untuk menyimpan urutan yang benar

      if (Array.isArray(indikatorData)) {
        // Buat mapping renaksi dan id berdasarkan id_indikator
        const renaksiByIdIndikator = {};
        const idByIdIndikator = {};

        indikatorData.forEach((item) => {
          if (item.id_indikator && item.renaksi && item.id) {
            renaksiByIdIndikator[item.id_indikator] = item.renaksi;
            idByIdIndikator[item.id_indikator] = item.id;
          }
        });

        // Untuk setiap bulan, buat mapping urutan yang konsisten
        for (let bulan in mappingBulanId) {
          const bulanIds = mappingBulanId[bulan];
          const bulanIdIndikators = mappingBulanIdIndikator[bulan];

          bulanIds.forEach((id, index) => {
            const idIndikator = bulanIdIndikators[index];
            if (renaksiByIdIndikator[idIndikator]) {
              renaksiOrderMap[id] = renaksiByIdIndikator[idIndikator];
            }
          });
        }

        // Ambil renaksi sesuai urutan mappingTupoksi (konsisten dengan form submission)
        mappingTupoksi.forEach((idIndikator) => {
          if (renaksiByIdIndikator[idIndikator]) {
            renaksiBulanId.push(renaksiByIdIndikator[idIndikator]);
          } else {
            renaksiBulanId.push(""); // Placeholder
          }
        });

        // Debug: Renaksi order processing completed
      }

      // Get bukti_dukung
      let buktiDukung = "";
      if (Array.isArray(indikatorData)) {
        const found = indikatorData.find((item) => item.bukti_dukung);
        if (found) buktiDukung = found.bukti_dukung;
      }

      const result = {
        // Data mentah
        indikatorData,
        penilaiaanArr,
        rhkIndikator,

        // Data processed untuk dropdown
        jumlahUnikIndikatorKinerja,
        mappingTupoksi,
        mappingBulanId,
        mappingBulanIdIndikator,
        renaksiBulanId,
        buktiDukung,

        success: true,
      };

      // JavaScript processing completed

      return result;
    } catch (error) {
      console.error("JavaScript Processing Error:", error);
      return { success: false, error: error.message };
    }
  };

  const monthLabel = formData.bulan
    ? (bulanOptions.find((option) => String(option.value) === String(formData.bulan))?.label || "").split(" - ")[0]
    : "";

  return (
    <ActionPage
      icon="fa-pen-to-square"
      title="Isi Rencana Aksi"
      subtitle="Pastikan rencana aksi telah ditambahkan sebelum mengisi."
      steps={["Pengguna", "Bulan", "Proses"]}
      hasUser={Boolean(formData.user)}
      monthLabel={monthLabel}
      canSubmit={Boolean(formData.user && formData.bulan)}
      isSubmitting={isLoading}
      onSubmit={handleSubmit}
      action={{ label: "Simpan Rencana Aksi", busyLabel: "Menyimpan...", icon: "fa-floppy-disk", variant: "success" }}
      confirm={{ title: "Simpan isian rencana aksi?", body: "Isian akan dikirim ke E-Kinerja untuk bulan terpilih." }}
      mappingError={mappingError}
      onRetry={() =>
        handleUserChangeRef.current({ target: { value: formData.user } })
      }
      message={message}
      monthSelector={
        <MonthSelector
          key={formData.user}
          id="bulan"
          options={bulanOptions}
          disabled={!formData.user}
          isLoading={isLoadingBulan}
          monthNumbers={monthNumbers}
          value={formData.bulan || ""}
          onChange={handleBulanChange}
        />
      }
    ></ActionPage>
  );
};


export default IsiComponent;
