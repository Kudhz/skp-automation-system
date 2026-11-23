import ActionPage from "./ActionPage";
import React, { useEffect, useRef, useState } from "react";
import { fetchUserMapping } from "../services/mappingService";
import MonthSelector from "./MonthSelector";
import { notifyError } from "../utils/notifications";
import { getNextAvailableMonthNumber } from "../utils/workflowStatus";
import { getMonthIndicatorMappings } from "../utils/monthOptions";
import { getSkpMonthNumbers } from "../utils/skpPage";

const TambahComponent = ({
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
    const requestKey = `${formData.unit_t}\u0000${formData.kategori_t}\u0000${username}\u0000${mappingRevision}`;
    requestedMappingKey.current = requestKey;
    setMappingError("");
    setMonthNumbers(null);

    setFormData((prev) => ({
      ...prev,
      user_t: username,
      bulan_t: "",
    }));
    onIdentityChange({
      unit: formData.unit_t,
      category: formData.kategori_t,
      user: username,
    });

    if (!username) {
      setBulanOptions([]);
      return;
    }

    // Ambil mapping bulan
    setIsLoadingBulan(true);
    try {
      const res = await fetchUserMapping({
        unit: formData.unit_t,
        category: formData.kategori_t,
        username,
      });
      if (requestedMappingKey.current !== requestKey) return;
      const availableMonths = getSkpMonthNumbers(res.period, res.year);
      setMonthNumbers(availableMonths);

      // 🔍 LOG: Monitor GET_MAPPING API Response

      const isSuccess =
        res &&
        (res.success === true || res.status?.toLowerCase() === "success");

      if (isSuccess) {
        // Set id_skp
        setFormData((prev) => ({
          ...prev,
          id_skp_t: res.id_skp || "",
        }));

        // Process raw response
        if (res.raw_response) {
          //   console.log('🔍 [TAMBAH] Processing raw response...');
          //   console.log('📄 [TAMBAH] Raw Response Data:', res.raw_response.substring(0, 500) + '...');
          const jsResult = processRawResponseJS(res.raw_response, res.year, availableMonths);
          console.log("✅ [TAMBAH] Parsing completed, result:", jsResult);

          // 📊 LOG: Monitor JavaScript Processing Results

          if (jsResult.success) {
            // Populate bulan dropdown
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
            const monthMapNum = {
              Januari: 1,
              Februari: 2,
              Maret: 3,
              April: 4,
              Mei: 5,
              Juni: 6,
              Juli: 7,
              Agustus: 8,
              September: 9,
              Oktober: 10,
              November: 11,
              Desember: 12,
            };

            const options = jsResult.monthStatusLabels.map((label) => ({
              value: "",
              label,
              disabled: true,
            }));
            if (jsResult.mappingIdPenilaiaan1) {
              monthOrder.forEach((nm) => {
                const val = jsResult.mappingIdPenilaiaan1[nm];
                if (val) {
                  const bulanNum = monthMapNum[nm];
                  options.push({ value: bulanNum, label: nm });
                }
              });
            }

            setBulanOptions(options);

            // Set tupoksi
            setFormData((prev) => ({
              ...prev,
              tupoksi: JSON.stringify(jsResult.mappingTupoksi || []),
            }));
          } else {
            // JS processing failed
            console.warn("JavaScript processing failed:", jsResult.error);
            setBulanOptions([
              { value: "", label: "❌ Gagal ambil data bulan", disabled: true },
            ]);
          }
        } else {
          // No raw_response
          console.warn("No raw_response found in API response");
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
    const identityKey = `${formData.unit_t}\u0000${formData.kategori_t}\u0000${formData.user_t}\u0000${mappingRevision}`;
    if (!formData.user_t) {
      requestedMappingKey.current = identityKey;
      setBulanOptions([]);
      setMonthNumbers(null);
      setMappingError("");
      setIsLoadingBulan(false);
      return;
    }
    if (requestedMappingKey.current === identityKey) return;

    requestedMappingKey.current = identityKey;
    handleUserChangeRef.current({ target: { value: formData.user_t } });
  }, [
    formData.kategori_t,
    formData.unit_t,
    formData.user_t,
    mappingRevision,
  ]);

  // Handler untuk perubahan Bulan
  const handleBulanChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      bulan_t: value,
    }));
  };

  // Handler untuk submit form
  const handleSubmit = (e) => {
    e.preventDefault();

    const { tupoksi, bulan_t, id_skp_t, user_t } = formData;

    if (!tupoksi || !bulan_t || !id_skp_t) {
      notifyError("Pastikan Tupoksi, Bulan, dan ID SKP sudah terisi.");
      return;
    }

    const payload = {
      tupoksi,
      bulan: bulan_t,
      id_skp: id_skp_t,
      username: user_t,
    };

    onSubmit(payload);
  };

  // Fungsi untuk memproses raw response (sama seperti di PHP)
  const processRawResponseJS = (rawResponse, currentYear, availableMonths) => {
    try {
      if (!rawResponse || typeof rawResponse !== "string") {
        throw new Error("Raw response is null, undefined, or not a string");
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
          console.log("Unique indikator kinerja:", jumlahUnikIndikatorKinerja);
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
          // Found penilaiaan data
        } catch (e) {
          console.error("Error parsing penilaiaan JSON:", e);
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
          // Found RHK indikator data
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

      // Generate mapping id_penilaian1 (bulan berikutnya)
      let mappingIdPenilaiaan1 = {};
      if (Array.isArray(penilaiaanArr)) {
        const bulanBerikutnya = getNextAvailableMonthNumber(penilaiaanArr, currentYear, availableMonths);
        if (bulan[bulanBerikutnya]) {
          const namaBulan = bulan[bulanBerikutnya];
          const idDitemukan = penilaiaanArr.find(
            (item) => parseInt(item.bulan) === bulanBerikutnya,
          );
          mappingIdPenilaiaan1[namaBulan] = idDitemukan
            ? idDitemukan.id
            : namaBulan;
        }
      }

      const filteredPenilaiaanArr = Array.isArray(penilaiaanArr)
        ? penilaiaanArr.filter((item) => item.tahun === currentYear)
        : [];
      const { mappingBulanId } = getMonthIndicatorMappings(
        penilaiaanArr,
        indikatorData,
        currentYear,
      );

      return {
        indikatorData,
        penilaiaanArr: filteredPenilaiaanArr,
        rhkIndikator,
        jumlahUnikIndikatorKinerja,
        mappingTupoksi,
        mappingIdPenilaiaan1,
        monthStatusLabels: Object.keys(mappingBulanId),
        success: true,
      };
    } catch (error) {
      console.error("JavaScript Processing Error:", error);
      return { success: false, error: error.message };
    }
  };

  const monthLabel = formData.bulan_t
    ? (bulanOptions.find((option) => String(option.value) === String(formData.bulan_t))?.label || "").split(" - ")[0]
    : "";

  return (
    <ActionPage
      icon="fa-circle-plus"
      title="Tambah Rencana Aksi"
      subtitle="Bulan yang tersedia adalah bulan yang belum memiliki rencana aksi."
      steps={["Pengguna", "Bulan", "Proses"]}
      hasUser={Boolean(formData.user_t)}
      monthLabel={monthLabel}
      canSubmit={Boolean(formData.user_t && formData.bulan_t)}
      isSubmitting={isLoading}
      onSubmit={handleSubmit}
      action={{ label: "Tambah Rencana Aksi", busyLabel: "Mengirim...", icon: "fa-plus", variant: "success" }}
      confirm={{ title: "Tambah rencana aksi?", body: "Rencana aksi baru akan dibuat pada E-Kinerja." }}
      mappingError={mappingError}
      onRetry={() =>
        handleUserChangeRef.current({ target: { value: formData.user_t } })
      }
      message={message}
      monthSelector={
        <MonthSelector
          key={formData.user_t}
          id="bulan_t"
          options={bulanOptions}
          disabled={!formData.user_t}
          isLoading={isLoadingBulan}
          monthNumbers={monthNumbers}
          value={formData.bulan_t || ""}
          onChange={handleBulanChange}
        />
      }
    ></ActionPage>
  );
};


export default TambahComponent;
