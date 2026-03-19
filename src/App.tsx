import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  FileText, 
  StickyNote, 
  Settings as SettingsIcon, 
  Clock, 
  Search, 
  Upload, 
  Plus, 
  X, 
  ChevronRight, 
  Download, 
  Filter,
  User,
  LogOut,
  Flower2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

import { TabType, ReconciliationReport, Transaction, UnmatchedEntry } from './types';
import { processOCR, reconcileData, analyzeDiscrepancies } from './services/geminiService';
import ReactMarkdown from 'react-markdown';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- COMPONENTS ---

const Sidebar = ({ activeTab, setActiveTab }: { activeTab: TabType, setActiveTab: (tab: TabType) => void }) => {
  const tabs: { id: TabType, icon: any, label: string }[] = [
    { id: 'Data', icon: LayoutDashboard, label: 'Data' },
    { id: 'Reports', icon: FileText, label: 'Reports' },
    { id: 'Notes', icon: StickyNote, label: 'Notes' },
    { id: 'Settings', icon: SettingsIcon, label: 'Settings' },
  ];

  return (
    <motion.div 
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed left-6 top-1/2 -translate-y-1/2 w-20 liquid-glass p-4 flex flex-col items-center gap-8 z-50 saffron-3d-glow"
    >
      <div className="flex flex-col gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "p-3 rounded-2xl transition-all duration-300 group relative glass-tab",
              activeTab === tab.id ? "active text-black saffron-3d-glow scale-110" : "text-black/40 hover:text-black hover:bg-black/5"
            )}
          >
            <tab.icon className="w-6 h-6" />
            <span className="absolute left-full ml-4 px-2 py-1 liquid-glass rounded-md text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none text-black font-bold">
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-auto">
        <button className="p-3 rounded-2xl text-black/40 hover:text-red-500 transition-all neumorphic-outset hover:scale-110 active:scale-95">
          <LogOut className="w-6 h-6" />
        </button>
      </div>
    </motion.div>
  );
};

const Header = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-between items-center mb-10 px-0">
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-6"
      >
        <h1 className="text-4xl font-display bold-black-text tracking-[0.1em]">Nikhut Reconciliation Solution</h1>
        <div className="h-10 w-px bg-black/10 mx-2" />
        <div className="flex flex-col">
          <span className="text-black font-sans text-[13px] leading-[16px] text-left uppercase tracking-[0.4em] font-bold">Developed By Joistho</span>
          <span className="font-sans text-justify text-[16px] leading-[22px] not-italic -ml-[26px] mt-[11px] -mb-[2px] mr-[61px] pr-[16px] pb-[9px] h-[35px] w-[277px] border-solid border-0 font-bold drop-shadow-sm mt-1">Saffron in every breath, lotus in every heart.</span>
        </div>
      </motion.div>

      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-6"
      >
        <div className="liquid-glass px-4 py-2 flex flex-col items-center neumorphic-outset border border-white/20 min-w-[140px]">
          <div className="flex items-center gap-2 mb-0.5">
            <Clock className="w-3 h-3 text-saffron" />
            <span className="font-mono text-sm tracking-[0.1em] text-black font-bold">
              {format(time, 'HH:mm:ss')}
            </span>
          </div>
          <span className="text-[10px] text-black/80 font-bold uppercase tracking-[0.2em]">
            {format(time, 'dd MMM yyyy')}
          </span>
        </div>
        <div className="liquid-glass px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-black/5 transition-colors neumorphic-outset">
          <User className="w-4 h-4 text-saffron" />
          <span className="text-sm font-bold text-black">Admin</span>
        </div>
      </motion.div>
    </div>
  );
};

// --- TABS ---

const DataTab = ({ onReportGenerated }: { onReportGenerated: (report: ReconciliationReport) => void }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('Ledger');
  const [subTypes, setSubTypes] = useState<string[]>([]);
  const [subTypeOptions, setSubTypeOptions] = useState(['Purchase', 'Sale', 'GSTR2B', 'GSTR 1']);
  const [newSubTypeInput, setNewSubTypeInput] = useState('');
  const [isAddingSubType, setIsAddingSubType] = useState(false);
  const [internalFile, setInternalFile] = useState<File | null>(null);
  const [externalFile, setExternalFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleAddNewSubType = () => {
    if (newSubTypeInput && !subTypeOptions.includes(newSubTypeInput)) {
      setSubTypeOptions(prev => [...prev, newSubTypeInput]);
      setSubTypes(prev => [...prev, newSubTypeInput]);
      setNewSubTypeInput('');
      setIsAddingSubType(false);
    }
  };

  const handleReconcile = async () => {
    if (!internalFile || !externalFile || !name) return;
    setIsProcessing(true);
    setError(null);
    setStatus("Reading files...");
    
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is missing. Please set it in your Netlify Environment Variables.");
      }

      const internalBase64 = await fileToBase64(internalFile);
      const externalBase64 = await fileToBase64(externalFile);
      
      setStatus("Extracting data from Internal Ledger...");
      const internalOCR = await processOCR(internalBase64, internalFile.type, (s) => setStatus(s));
      
      setStatus("Extracting data from External Ledger...");
      const externalOCR = await processOCR(externalBase64, externalFile.type, (s) => setStatus(s));
      
      setStatus("Reconciling entries...");
      const extractedName = internalOCR.companyName || externalOCR.companyName || name;
      const report = await reconcileData(internalOCR.transactions, externalOCR.transactions, { name: extractedName, type, subType: subTypes });
      if (!name && extractedName) setName(extractedName);
      onReportGenerated(report);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during processing.");
    } finally {
      setIsProcessing(false);
      setStatus(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] text-black/60 font-display font-bold uppercase tracking-[0.2em] ml-1">1. Name</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., ABC Ltd."
            className="w-full liquid-glass neumorphic-inset rounded-2xl px-4 py-3 outline-none focus:ring-2 ring-saffron/50 transition-all text-black font-serif font-bold placeholder:text-black/30"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[10px] text-black/60 font-display font-bold uppercase tracking-[0.2em] ml-1">2. Type</label>
          <select 
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full liquid-glass neumorphic-inset rounded-2xl px-4 py-3 outline-none focus:ring-2 ring-saffron/50 transition-all appearance-none text-black font-serif font-bold"
          >
            <option value="Ledger">Ledger</option>
            <option value="Bank">Bank</option>
            <option value="GST">GST</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] text-black/60 font-display font-bold uppercase tracking-[0.2em] ml-1">3. Sub-Type</label>
          <div className="flex gap-2 flex-wrap">
            {subTypeOptions.map(st => (
              <button
                key={st}
                onClick={() => setSubTypes(prev => prev.includes(st) ? prev.filter(x => x !== st) : [...prev, st])}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-serif font-bold transition-all neumorphic-outset",
                  subTypes.includes(st) ? "bg-saffron text-black saffron-3d-glow" : "liquid-glass text-black/60 hover:text-black"
                )}
              >
                {st}
              </button>
            ))}
            {isAddingSubType ? (
              <div className="flex items-center gap-2 animate-in fade-in zoom-in duration-300">
                <input 
                  autoFocus
                  type="text"
                  value={newSubTypeInput}
                  onChange={(e) => setNewSubTypeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNewSubType()}
                  placeholder="Type..."
                  className="w-24 px-3 py-1 rounded-full text-xs liquid-glass neumorphic-inset outline-none border border-saffron/30 font-bold text-black"
                />
                <button 
                  onClick={handleAddNewSubType}
                  className="p-1 rounded-full bg-saffron text-black hover:scale-110 transition-transform"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => setIsAddingSubType(false)}
                  className="p-1 rounded-full bg-black/5 text-black/40 hover:text-black transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAddingSubType(true)}
                className="px-3 py-1 rounded-full text-xs liquid-glass text-black/40 hover:text-black border border-dashed border-black/20 neumorphic-outset font-bold"
              >
                <Plus className="w-3 h-3 inline mr-1" /> Add New
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="liquid-glass neumorphic-outset rounded-3xl p-8 flex flex-col items-center justify-center gap-4 text-center group cursor-pointer relative overflow-hidden transition-all hover:scale-[1.02]">
          <div className="absolute inset-0 bg-saffron/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-4 rounded-2xl bg-black/5 text-black/40 group-hover:text-saffron transition-colors neumorphic-inset">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <h4 className="font-bold text-black mb-1">Internal Data</h4>
            <p className="text-xs text-black/40 font-medium">Upload PDF/CSV Ledger</p>
          </div>
          <input 
            type="file" 
            className="absolute inset-0 opacity-0 cursor-pointer" 
            onChange={(e) => setInternalFile(e.target.files?.[0] || null)}
          />
          {internalFile && <span className="text-xs text-saffron font-bold mt-2">{internalFile.name}</span>}
        </div>

        <div className="liquid-glass neumorphic-outset rounded-3xl p-8 flex flex-col items-center justify-center gap-4 text-center group cursor-pointer relative overflow-hidden transition-all hover:scale-[1.02]">
          <div className="absolute inset-0 bg-saffron/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-4 rounded-2xl bg-black/5 text-black/40 group-hover:text-saffron transition-colors neumorphic-inset">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <h4 className="font-bold text-black mb-1">External Data</h4>
            <p className="text-xs text-black/40 font-medium">Upload PDF/CSV Statement</p>
          </div>
          <input 
            type="file" 
            className="absolute inset-0 opacity-0 cursor-pointer" 
            onChange={(e) => setExternalFile(e.target.files?.[0] || null)}
          />
          {externalFile && <span className="text-xs text-saffron font-bold mt-2">{externalFile.name}</span>}
        </div>
      </div>

      <div className="flex justify-center pt-4 flex-col items-center gap-4">
        {error && (
          <div className="w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm font-bold animate-in fade-in zoom-in duration-300">
            ⚠️ {error}
          </div>
        )}
        {status && isProcessing && (
          <div className="w-full max-w-md p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-600 text-sm font-medium animate-pulse">
            🔍 {status}
          </div>
        )}
        <button 
          onClick={handleReconcile}
          disabled={isProcessing || !internalFile || !externalFile || !name}
          className="px-12 py-4 bg-saffron text-black font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all saffron-3d-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 neumorphic-outset"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              Analyzing via AI...
            </>
          ) : (
            <>
              <ChevronRight className="w-5 h-5" />
              Generate Reconciliation Report
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const ReportsTab = ({ reports }: { reports: ReconciliationReport[] }) => {
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState<ReconciliationReport | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async (report: ReconciliationReport) => {
    if (!process.env.GEMINI_API_KEY) {
      alert("GEMINI_API_KEY is missing. Please set it in your environment variables.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeDiscrepancies(report);
      setAiAnalysis(analysis);
    } catch (error: any) {
      console.error("Analysis failed:", error);
      alert(error.message || "AI Analysis failed. Please try again later.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const closeReport = () => {
    setSelectedReport(null);
    setAiAnalysis(null);
  };

  const filteredReports = reports.filter(r => 
    r.name.toLowerCase().includes(search.toLowerCase()) || 
    r.type.toLowerCase().includes(search.toLowerCase())
  );

  const exportToPDF = (report: ReconciliationReport) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    doc.setFontSize(20);
    doc.text(`Reconciliation Report: ${report.name}`, 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Company: ${report.name}`, 14, 32);
    doc.text(`Type: ${report.type} | Sub-Types: ${report.subType.join(', ')}`, 14, 40);
    doc.text(`Last Edit: ${report.lastEdit}`, 14, 48);
    
    doc.text(`Internal Balance: Rs. ${report.internalBalance.toLocaleString()}`, 14, 60);
    doc.text(`External Balance: Rs. ${report.externalBalance.toLocaleString()}`, 14, 68);
    doc.text(`Difference: Rs. ${report.difference.toLocaleString()}`, 14, 76);

    const tableData = report.unmatchedEntries.map(entry => [
      entry.internal ? `${entry.internal.date}\n${entry.internal.particulars}\nRs. ${entry.internal.debit || entry.internal.credit}` : 'No record',
      entry.external ? `${entry.external.date}\n${entry.external.particulars}\nRs. ${entry.external.debit || entry.external.credit}` : 'No record',
      entry.reason
    ]);

    autoTable(doc, {
      startY: 85,
      head: [['Internal Entry', 'External Entry', 'Reason for Discrepancy']],
      body: tableData,
      theme: 'grid',
      styles: { overflow: 'linebreak', cellPadding: 4 },
      headStyles: { fillColor: [255, 153, 51], textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 80 },
        2: { cellWidth: 'auto' }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;
    doc.setFontSize(14);
    doc.setTextColor(255, 153, 51);
    doc.text('AI Conclusion:', 14, finalY + 15);
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    const splitText = doc.splitTextToSize(report.aiConclusion, 260);
    doc.text(splitText, 14, finalY + 25);

    doc.save(`${report.name}_Reconciliation.pdf`);
  };

  const exportToCSV = (report: ReconciliationReport) => {
    const csvData = report.unmatchedEntries.map(entry => ({
      Internal_Date: entry.internal?.date || '',
      Internal_Particulars: entry.internal?.particulars || '',
      Internal_Amount: entry.internal ? (entry.internal.debit || entry.internal.credit) : '',
      External_Date: entry.external?.date || '',
      External_Particulars: entry.external?.particulars || '',
      External_Amount: entry.external ? (entry.external.debit || entry.external.credit) : '',
      Reason: entry.reason
    }));
    
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${report.name}_Reconciliation.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
          <input 
            type="text" 
            placeholder="Search by Name or Tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full liquid-glass neumorphic-inset rounded-2xl pl-12 pr-4 py-3 outline-none focus:ring-2 ring-saffron/50 transition-all text-black font-bold placeholder:text-black/30"
          />
        </div>
        <button className="liquid-glass neumorphic-outset px-4 py-3 rounded-2xl hover:bg-black/5 transition-colors text-black">
          <Filter className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredReports.length > 0 ? filteredReports.map((report) => (
          <motion.div 
            key={report.id}
            layoutId={report.id}
            onClick={() => setSelectedReport(report)}
            className="liquid-glass neumorphic-outset p-6 rounded-3xl hover:bg-black/5 transition-all cursor-pointer group flex justify-between items-center"
          >
            <div className="flex items-center gap-6">
              <div className="w-12 h-12 rounded-2xl bg-saffron/10 flex items-center justify-center text-saffron group-hover:scale-110 transition-transform neumorphic-inset">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-lg text-black">{report.name}</h4>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-black/40 bg-black/5 px-2 py-0.5 rounded-md">{report.type}</span>
                  {report.subType.map(st => (
                    <span key={st} className="text-[10px] uppercase font-bold tracking-widest text-saffron bg-saffron/5 px-2 py-0.5 rounded-md">{st}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-black/40 font-bold uppercase tracking-widest mb-1">Last Edit</div>
              <div className="font-mono text-sm text-black/80 font-bold">{report.lastEdit}</div>
            </div>
          </motion.div>
        )) : (
          <div className="text-center py-20 liquid-glass neumorphic-inset rounded-3xl border-dashed border-black/10">
            <FileText className="w-12 h-12 text-black/10 mx-auto mb-4" />
            <p className="text-black/40 font-bold">No reports found. Generate one in the Data tab!</p>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedReport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeReport}
              className="absolute inset-0 bg-white/40 backdrop-blur-xl"
            />
            <motion.div 
              layoutId={selectedReport.id}
              className="liquid-glass neumorphic-outset w-full max-w-5xl max-h-[90vh] rounded-[40px] overflow-hidden flex flex-col z-10 saffron-3d-glow"
            >
              <div className="p-8 border-b border-black/10 flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-display bold-black-text tracking-wide">{selectedReport.name}</h2>
                  <p className="text-black/60 font-bold text-sm mt-1">Company: {selectedReport.name}</p>
                  <p className="text-black/40 font-bold text-sm mt-1 font-serif italic tracking-wide">Reconciliation Report • {selectedReport.lastEdit}</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => handleAnalyze(selectedReport)}
                    disabled={isAnalyzing}
                    className="p-3 rounded-2xl liquid-glass neumorphic-outset hover:bg-black/5 transition-colors text-indigo-600 disabled:opacity-50"
                    title="Analyze with AI"
                  >
                    <Flower2 className={cn("w-6 h-6", isAnalyzing && "animate-spin")} />
                  </button>
                  <button 
                    onClick={() => exportToPDF(selectedReport)}
                    className="p-3 rounded-2xl liquid-glass neumorphic-outset hover:bg-black/5 transition-colors text-saffron"
                    title="Download PDF"
                  >
                    <Download className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => exportToCSV(selectedReport)}
                    className="p-3 rounded-2xl liquid-glass neumorphic-outset hover:bg-black/5 transition-colors text-emerald-600"
                    title="Download CSV"
                  >
                    <FileText className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={closeReport}
                    className="p-3 rounded-2xl liquid-glass neumorphic-outset hover:bg-black/5 transition-colors text-black"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Balance Summary Bar */}
                <div className="liquid-glass neumorphic-inset p-4 rounded-2xl flex justify-between items-center bg-saffron/5 border border-saffron/20">
                  <div className="flex gap-8 items-center px-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-black/40 tracking-widest">Internal</span>
                      <span className="text-lg font-mono font-bold text-black">₹{selectedReport.internalBalance.toLocaleString()}</span>
                    </div>
                    <div className="w-px h-8 bg-black/10" />
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-black/40 tracking-widest">External</span>
                      <span className="text-lg font-mono font-bold text-black">₹{selectedReport.externalBalance.toLocaleString()}</span>
                    </div>
                    <div className="w-px h-8 bg-black/10" />
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-black/40 tracking-widest">Difference</span>
                      <span className={cn("text-lg font-mono font-bold", selectedReport.difference === 0 ? "text-emerald-600" : "text-red-600")}>
                        ₹{selectedReport.difference.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className={cn(
                    "px-6 py-2 rounded-xl font-bold text-xs uppercase tracking-widest neumorphic-outset",
                    selectedReport.difference === 0 ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                  )}>
                    {selectedReport.difference === 0 ? "Balanced" : "Discrepancy Detected"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6">
                  <div className="liquid-glass neumorphic-inset p-6 rounded-3xl text-center">
                    <div className="text-[10px] text-black/40 font-bold uppercase tracking-[0.2em] mb-2">Internal Balance</div>
                    <div className="text-2xl font-mono bold-black-text tracking-tight">₹{selectedReport.internalBalance.toLocaleString()}</div>
                  </div>
                  <div className="liquid-glass neumorphic-inset p-6 rounded-3xl text-center">
                    <div className="text-[10px] text-black/40 font-bold uppercase tracking-[0.2em] mb-2">External Balance</div>
                    <div className="text-2xl font-mono bold-black-text tracking-tight">₹{selectedReport.externalBalance.toLocaleString()}</div>
                  </div>
                  <div className={cn(
                    "p-6 rounded-3xl text-center neumorphic-inset",
                    selectedReport.difference === 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                  )}>
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-2 opacity-60">Difference</div>
                    <div className="text-2xl font-mono font-bold tracking-tight">₹{selectedReport.difference.toLocaleString()}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-black flex items-center gap-2">
                    <ChevronRight className="w-5 h-5 text-saffron" />
                    Unmatched Entries
                  </h3>
                  <div className="space-y-3">
                    {selectedReport.unmatchedEntries.map((entry, idx) => (
                      <div key={idx} className="liquid-glass neumorphic-outset p-6 rounded-3xl flex gap-8 items-start">
                        <div className="flex-1 space-y-2">
                          <div className="text-[10px] uppercase font-bold tracking-widest text-black/20">Internal</div>
                          {entry.internal ? (
                            <div className="text-sm text-black font-bold">
                              <span className="text-black/40">{entry.internal.date}</span> • {entry.internal.particulars} • <span className="text-saffron">₹{entry.internal.debit || entry.internal.credit}</span>
                            </div>
                          ) : <div className="text-sm text-black/10 italic font-bold">No record</div>}
                        </div>
                        <div className="w-px h-12 bg-black/5 self-center" />
                        <div className="flex-1 space-y-2">
                          <div className="text-[10px] uppercase font-bold tracking-widest text-black/20">External</div>
                          {entry.external ? (
                            <div className="text-sm text-black font-bold">
                              <span className="text-black/40">{entry.external.date}</span> • {entry.external.particulars} • <span className="text-saffron">₹{entry.external.debit || entry.external.credit}</span>
                            </div>
                          ) : <div className="text-sm text-black/10 italic font-bold">No record</div>}
                        </div>
                        <div className="w-px h-12 bg-black/5 self-center" />
                        <div className="flex-1">
                          <div className="text-[10px] uppercase font-bold tracking-widest text-red-600/40">Reason</div>
                          <div className="text-sm text-red-600 font-bold">{entry.reason}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="liquid-glass neumorphic-inset p-8 rounded-3xl bg-saffron/5 border border-saffron/20">
                  <h3 className="text-lg font-bold text-saffron mb-4 flex items-center gap-2">
                    <Flower2 className="w-5 h-5" />
                    AI Conclusion
                  </h3>
                  <p className="text-black/80 leading-relaxed italic font-bold">
                    "{selectedReport.aiConclusion}"
                  </p>
                </div>

                {aiAnalysis && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="liquid-glass neumorphic-inset p-8 rounded-3xl bg-indigo-500/5 border border-indigo-500/20"
                  >
                    <h3 className="text-lg font-bold text-indigo-600 mb-4 flex items-center gap-2">
                      <LayoutDashboard className="w-5 h-5" />
                      Deep AI Analysis
                    </h3>
                    <div className="prose prose-sm max-w-none text-black/80 font-bold leading-relaxed">
                      <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NotesTab = () => (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="liquid-glass neumorphic-outset p-8 rounded-[40px]">
      <h3 className="text-2xl font-bold mb-6 flex items-center gap-3 text-black">
        <StickyNote className="w-6 h-6 text-saffron" />
        AI Insights & Observations
      </h3>
      
      <div className="liquid-glass neumorphic-inset p-6 rounded-3xl mb-8 bg-saffron/5 border border-saffron/20 shadow-inner">
        <div className="text-[10px] text-black/40 font-bold uppercase tracking-[0.3em] mb-3">Reconciliation Formula</div>
        <div className="text-2xl font-serif italic text-saffron font-bold drop-shadow-md tracking-wide">
          {"Balance_{\\text{Final}} = Balance_{\\text{Opening}} + \\sum \\text{Credits} - \\sum \\text{Debits}"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {[
          { title: "Recurring Discrepancies", content: "AI has noticed a pattern of rounding errors in ABC Ltd. statements over the last 3 months.", icon: Clock },
          { title: "Tagging Suggestions", content: "Based on particulars, 'TCS' entries are being auto-tagged as 'Journal' for better classification.", icon: Search },
          { title: "Efficiency Metric", content: "Reconciliation speed has improved by 40% since implementing the new OCR mapping.", icon: LayoutDashboard },
          { title: "Audit Readiness", content: "All reports generated this week meet the A4 Landscape compliance standards.", icon: FileText },
        ].map((insight, i) => (
          <div key={i} className="liquid-glass neumorphic-outset p-6 rounded-3xl hover:bg-black/5 transition-colors group">
            <div className="w-10 h-10 rounded-xl bg-saffron/10 flex items-center justify-center text-saffron mb-4 group-hover:scale-110 transition-transform neumorphic-inset">
              <insight.icon className="w-5 h-5" />
            </div>
            <h4 className="font-bold mb-2 text-black">{insight.title}</h4>
            <p className="text-sm text-black/60 font-bold leading-relaxed">{insight.content}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const SettingsTab = () => (
  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="liquid-glass neumorphic-outset p-8 rounded-[40px]">
      <h3 className="text-2xl font-bold mb-8 flex items-center gap-3 text-black">
        <SettingsIcon className="w-6 h-6 text-saffron" />
        System Configuration
      </h3>
      <div className="space-y-6">
        {[
          { label: "OCR Sensitivity", desc: "Adjust how strictly the AI parses handwritten or blurry text.", type: "range" },
          { label: "Auto-Archive", desc: "Reports older than 12 months will be moved to deep storage.", type: "toggle" },
          { label: "Landscape Export", desc: "Default PDF export format for reconciliation reports.", type: "toggle", default: true },
          { label: "Saffron Theme Intensity", desc: "Control the glow and accent saturation of the UI.", type: "range" },
        ].map((setting, i) => (
          <div key={i} className="flex justify-between items-center py-4 border-b border-black/5 last:border-0">
            <div>
              <div className="font-bold text-black">{setting.label}</div>
              <div className="text-xs text-black/40 font-bold">{setting.desc}</div>
            </div>
            {setting.type === "toggle" ? (
              <div className={cn("w-12 h-6 rounded-full p-1 cursor-pointer transition-colors neumorphic-inset", setting.default ? "bg-saffron" : "bg-black/10")}>
                <div className={cn("w-4 h-4 bg-white rounded-full transition-transform shadow-md", setting.default ? "translate-x-6" : "translate-x-0")} />
              </div>
            ) : (
              <input type="range" className="accent-saffron w-32 cursor-pointer" />
            )}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// --- MAIN APP ---

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('Data');
  const [reports, setReports] = useState<ReconciliationReport[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowWelcome(false), 5500);
    fetchReports();
    return () => clearTimeout(timer);
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      } else {
        throw new Error("API failed");
      }
    } catch (e) {
      console.warn("Failed to fetch reports from API, falling back to localStorage", e);
      const localData = localStorage.getItem('nikhut_reports');
      if (localData) {
        setReports(JSON.parse(localData));
      }
    }
  };

  const handleReportGenerated = async (report: ReconciliationReport) => {
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });
      if (!res.ok) throw new Error("API failed");
    } catch (e) {
      console.warn("Failed to save report to API, saving to localStorage", e);
      const localData = localStorage.getItem('nikhut_reports');
      const reports = localData ? JSON.parse(localData) : [];
      reports.unshift(report);
      localStorage.setItem('nikhut_reports', JSON.stringify(reports));
    }
    setReports(prev => [report, ...prev]);
    setActiveTab('Reports');
  };

  return (
    <div className="min-h-screen p-8 pl-32 bg-[#f0f2f5]">
      <div className="mandala-bg" />
      
      <AnimatePresence>
        {showWelcome && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#f0f2f5] flex items-center justify-center"
          >
            <div className="relative w-96 h-[450px] flex items-center justify-center">
              {/* Scroll Content */}
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 450, opacity: 1 }}
                transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.5 }}
                className="absolute w-80 bg-[#fdfaf2] shadow-[inset_0_0_60px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col items-center justify-between py-12 border-x-8 border-[#e5d5b5]"
                style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")' }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/5 pointer-events-none" />
                
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 2.0, duration: 1 }}
                  className="z-10"
                >
                  <Flower2 className="w-12 h-12 text-saffron drop-shadow-[0_0_10px_rgba(255,153,51,0.5)]" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.4, duration: 1 }}
                  className="text-center px-4 z-10 w-full"
                >
                  <h2 className="text-[10px] tracking-[0.4em] text-black/40 uppercase mb-4 font-bold">Developed By Joistho</h2>
                  <h1 className="text-4xl font-display bold-black-text mb-2 tracking-[0.15em] leading-tight">NIKHUT</h1>
                  <p className="text-saffron font-serif italic text-3xl font-bold drop-shadow-sm mt-4 tracking-[0.1em]">निखूत</p>
                  <div className="w-16 h-px bg-saffron/40 mx-auto mt-8" />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 3.4, duration: 1.2 }}
                  className="z-10 text-[12px] text-black/80 font-serif italic tracking-widest text-center px-8 leading-relaxed"
                >
                  "Saffron in every breath,<br/>Lotus in every heart"
                </motion.div>
              </motion.div>

              {/* Top Roller */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: -225 }}
                transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.5 }}
                className="absolute z-20 w-96 h-12 bg-[#5D2E0A] rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.4)] border-b-4 border-black/20 flex justify-between px-6 items-center"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-800 shadow-lg border border-yellow-400/30" />
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-800 shadow-lg border border-yellow-400/30" />
              </motion.div>

              {/* Bottom Roller */}
              <motion.div
                initial={{ y: 0 }}
                animate={{ y: 225 }}
                transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1], delay: 0.5 }}
                className="absolute z-20 w-96 h-12 bg-[#5D2E0A] rounded-full shadow-[0_-10px_30px_rgba(0,0,0,0.4)] border-t-4 border-black/20 flex justify-between px-6 items-center"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-800 shadow-lg border border-yellow-400/30" />
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-800 shadow-lg border border-yellow-400/30" />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="max-w-7xl mx-auto">
        <Header />
        
        <div className="liquid-glass p-10 min-h-[70vh] relative overflow-hidden neumorphic-outset">
          <div className="absolute top-0 right-0 w-96 h-96 bg-saffron/5 blur-[120px] rounded-full -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-saffron/5 blur-[120px] rounded-full -ml-48 -mb-48" />
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {activeTab === 'Data' && <DataTab onReportGenerated={handleReportGenerated} />}
              {activeTab === 'Reports' && <ReportsTab reports={reports} />}
              {activeTab === 'Notes' && <NotesTab />}
              {activeTab === 'Settings' && <SettingsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <footer className="fixed bottom-6 left-32 text-[10px] text-black/60 uppercase tracking-[0.3em] font-bold">
        © 2026 Developed By Joistho • Nikhut Reconciliation Engine v1.0
      </footer>
    </div>
  );
}
