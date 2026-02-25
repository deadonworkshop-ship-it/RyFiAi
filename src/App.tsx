import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  X,
  ChevronRight,
  Home,
  CreditCard,
  TrendingDown,
  TrendingUp,
  PiggyBank,
  BarChart3,
  Settings,
  Loader2,
  Wallet,
  History,
  PieChart as PieChartIcon,
  Check,
  Trash2,
  Download,
  Upload,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip 
} from 'recharts';
import { Bill, GlobalExpense, Snapshot, Flow, Goal, Summary } from './types';

// --- Constants from BillsOps ---
const BASELINE_BILLS = [
  { name: "Land Payment", amount: 907.50, phase: 1 },
  { name: "T-Mobile", amount: 357.34, phase: 1 },
  { name: "Mortgage", amount: 2406.28, phase: 1 },
  { name: "AAFMAA", amount: 33.35, phase: 1 },
  { name: "Travelers Insurance", amount: 392.75, phase: 1 },
  { name: "TRICARE", amount: 286.66, phase: 1 }, 
  { name: "Express Scripts", amount: 14.00, phase: 1 },
  { name: "Car Payment - Highlander", amount: 229.03, phase: 1 },
  { name: "Car Payment - Tesla", amount: 569.00, phase: 1 },
  { name: "Amelia 529", amount: 100.00, phase: 2 },
  { name: "Julia 529", amount: 100.00, phase: 2 },
  { name: "Netflix", amount: 27.39, phase: 2 },
  { name: "Denver Water", amount: 61.06, phase: 2 },
  { name: "Travelers Insurance", amount: 378.50, phase: 2 },
  { name: "Xcel Energy", amount: 300.00, phase: 2 },
  { name: "BAM Internet", amount: 80.10, phase: 2 }
];

const DEFAULT_CATEGORIES = {
  investment: [
    "TSP", "Ryan Roth IRA - Decade Perspective", "Ashley Schwab Roth IRA", 
    "Ashley Schwab Rollover IRA", "Ryan Schwab Brokerage", "Ryan Schwab Brokerage 2", 
    "Ryan PCRA Trust - Bonfire", "UC Health Fidelity", "Ashley Old IRA", "Robinhood"
  ],
  debt: [
    "House Mortgage", "Land Mortgage", "Tesla Loan", "Highlander Loan", 
    "USAA Signature Credit Card", "USAA Platinum Credit Card", "AMEX Platinum Card", 
    "AMEX Blue Cash Credit Card", "AMEX Delta Credit Card", "AMEX Bonvoy Card", 
    "Amazon Prime Credit Card", "Amazon Prime Business Credit Card" 
  ],
  savings: [
    "USAA Savings", "Marcus Savings", "Discover Savings", "SOFI Savings", "BlueVine", "Cash"
  ],
  assumptions: [
    "Home Value", "Land Value"
  ],
  income: ["USAF", "VA", "United", "UC Health", "FastCap", "Miscellaneous"],
  tax: [
    "USAF State", "USAF Federal", "UC Health State", "UC Health Federal", 
    "United State", "United Federal", "Extra State", "Extra Federal"
  ],
  retirement: [
    "Ryan Roth IRA - Decade Perspective", "Ryan Traditional IRA - Decade Perspective", 
    "Ryan Roth IRA - LRC", "Ryan Traditional IRA - LRC", 
    "Ryan Roth TSP", "Ryan Traditional TSP", 
    "Ryan Roth PRAP", "Ryan Traditional PRAP", 
    "Ashley Traditional IRA - LRC", "Ashley Roth IRA - LRC", 
    "Ashley 403b", "Ashley 457b", "Ashley 401a"
  ]
};

const CREDIT_CARDS = DEFAULT_CATEGORIES.debt.filter(d => d.toLowerCase().includes('card'));

const formatMoney = (amount: number) => new Intl.NumberFormat('en-US', { 
  style: 'currency', 
  currency: 'USD',
  minimumFractionDigits: 2
}).format(amount);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-bg-card border border-border-subtle p-3 rounded-xl shadow-2xl">
        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">{label}</p>
        {payload.map((p: any, idx: number) => (
          <p key={idx} className="text-sm font-black" style={{ color: p.color || p.stroke }}>
            {p.name}: {formatMoney(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function App() {
  // --- Navigation & UI State ---
  const [currentPage, setCurrentPage] = useState('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingBalance, setIsEditingBalance] = useState(false);
  const [activeModal, setActiveModal] = useState<{
    type: 'bill' | 'snapshot' | 'flow' | 'debt_payment' | 'expense';
    id?: number;
    tracker?: string;
    account?: string;
    amount?: number;
    name?: string;
    phase?: number;
    description?: string;
    date?: string;
    paid?: boolean;
  } | null>(null);
  const [activeMonth, setActiveMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showCommandPanel, setShowCommandPanel] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<{ input: string; result: string; success: boolean }[]>([]);
  const [backupEmail, setBackupEmail] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [rawDbData, setRawDbData] = useState<any>(null);
  const [pendingAction, _setPendingAction] = useState<{
    calls: any[];
  } | null>(null);
  const pendingActionRef = useRef<any>(null);
  const setPendingAction = (action: any) => {
    _setPendingAction(action);
    pendingActionRef.current = action;
  };
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  // --- Helpers ---
  const getHistoricalData = (trackerType?: string | 'networth') => {
    if (!rawDbData) return [];
    
    const currentYear = activeMonth.split('-')[0];
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    
    return months.map(m => {
      const monthKey = `${currentYear}-${m}`;
      const snapshotKey = `snapshots_${monthKey}`;
      const snapshots = rawDbData[snapshotKey] || [];
      
      let value = 0;
      if (trackerType === 'networth') {
        const assets = snapshots.filter((s: any) => ['investment', 'savings', 'assumptions'].includes(s.tracker)).reduce((s: number, i: any) => s + i.amount, 0);
        const liabilities = snapshots.filter((s: any) => s.tracker === 'debt').reduce((s: number, i: any) => s + i.amount, 0);
        value = assets - liabilities;
      } else if (trackerType) {
        value = snapshots.filter((s: any) => s.tracker === trackerType).reduce((s: number, i: any) => s + i.amount, 0);
      }
      
      return {
        name: new Date(parseInt(currentYear), parseInt(m)-1).toLocaleString('default', { month: 'short' }),
        value: value,
        fullDate: monthKey
      };
    }).filter(d => d.value !== 0);
  };

  // --- Data State ---
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [expenses, setExpenses] = useState<GlobalExpense[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Refs for Data Consistency ---
  const billsRef = useRef<Bill[]>([]);
  const snapshotsRef = useRef<Snapshot[]>([]);
  const commandInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { billsRef.current = bills; }, [bills]);
  useEffect(() => { snapshotsRef.current = snapshots; }, [snapshots]);

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/data');
      const allData = await response.json();
      
      const bData = allData[`bills_${activeMonth}`] || [];
      const fData = allData[`flows_${activeMonth}`] || [];
      const sData = allData[`snapshots_${activeMonth}`] || [];
      const storedExpenses = allData['global_expenses'] || [];
      const storedBalance = allData['current_balance'] || '0';
      const storedAnalytics = allData[`analytics_${activeMonth}`];
      const storedEmail = allData['backup_email'] || import.meta.env.VITE_USER_EMAIL || '';

      setBills(bData);
      setFlows(fData);
      setSnapshots(sData);
      setBackupEmail(storedEmail);
      setRawDbData(allData);

      // Calculate Summary
      const income = fData.filter((f: any) => f.tracker === 'income').reduce((s: number, f: any) => s + f.amount, 0);
      const taxes = sData.filter((s: any) => s.tracker === 'tax').reduce((sum: number, s: any) => sum + s.amount, 0);
      const retirement = sData.filter((s: any) => s.tracker === 'retirement').reduce((sum: number, s: any) => sum + s.amount, 0);
      const billsTotal = bData.reduce((s: number, b: any) => s + b.amount, 0);
      const billsPaid = bData.filter((b: any) => b.paid).reduce((s: number, b: any) => s + b.amount, 0);

      setSummary({ income, taxes, retirement, billsTotal, billsPaid });

      if (storedAnalytics) setAnalytics(storedAnalytics);
      else setAnalytics({ categoryBreakdown: [], monthlySpending: [], recentTrends: [] });

      setExpenses(storedExpenses);
      setCurrentBalance(parseFloat(storedBalance));
      setLastSynced(new Date());
    } catch (err) {
      console.error("Failed to load data:", err);
      setError("Failed to load data from server.");
    } finally {
      setIsLoading(false);
    }
  }, [activeMonth]);

  useEffect(() => {
    const seedData = async () => {
      try {
        const response = await fetch('/api/data');
        const allData = await response.json();
        const updates: any = {};

        if (!allData['current_balance']) {
          updates['current_balance'] = '12500.00';
        }
        
        if (!allData[`bills_${activeMonth}`]) {
          updates[`bills_${activeMonth}`] = BASELINE_BILLS.map((b, idx) => ({
            ...b,
            id: Date.now() + idx,
            paid: false,
            month: activeMonth
          }));
        }

        if (!allData['global_expenses']) {
          updates['global_expenses'] = [
            { id: 1, name: "Property Tax (Annual)", amount: 4500, paid: false },
            { id: 2, name: "HOA Dues", amount: 150, paid: true }
          ];
        }

        if (!allData[`snapshots_${activeMonth}`]) {
          const initialSnapshots: Snapshot[] = [];
          Object.entries(DEFAULT_CATEGORIES).forEach(([tracker, accounts]) => {
            if (['investment', 'debt', 'savings', 'assumptions', 'tax', 'retirement'].includes(tracker)) {
              accounts.forEach((account, idx) => {
                initialSnapshots.push({
                  id: Date.now() + idx + 1000,
                  tracker: tracker as any,
                  account,
                  amount: 0,
                  month: activeMonth
                });
              });
            }
          });
          updates[`snapshots_${activeMonth}`] = initialSnapshots;
        }

        if (!allData[`flows_${activeMonth}`]) {
          updates[`flows_${activeMonth}`] = [];
        }

        if (Object.keys(updates).length > 0) {
          await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...allData, ...updates })
          });
        }
        fetchData();
      } catch (err) {
        console.error("Seeding failed:", err);
      }
    };

    seedData();
  }, [activeMonth, fetchData]);

  // --- Command Bar: Fuzzy Matching ---
  const findBill = (search: string): Bill | undefined => {
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return undefined;
    const currentBills = billsRef.current;
    // Exact name match
    let bill = currentBills.find(b => b.name.toLowerCase() === search.toLowerCase());
    // Partial match (all terms must match)
    if (!bill) bill = currentBills.find(b => terms.every(t => b.name.toLowerCase().includes(t)));
    // Any term match
    if (!bill) bill = currentBills.find(b => terms.some(t => b.name.toLowerCase().includes(t)));
    return bill;
  };

  const findAccount = (search: string): { tracker: string; account: string } | undefined => {
    const lower = search.toLowerCase();
    const allCategories = Object.entries(DEFAULT_CATEGORIES);
    for (const [tracker, accounts] of allCategories) {
      // Exact match
      const exact = accounts.find(a => a.toLowerCase() === lower);
      if (exact) return { tracker, account: exact };
    }
    for (const [tracker, accounts] of allCategories) {
      // Partial match
      const partial = accounts.find(a => a.toLowerCase().includes(lower) || lower.includes(a.toLowerCase()));
      if (partial) return { tracker, account: partial };
    }
    // Word-level match
    const words = lower.split(/\s+/);
    for (const [tracker, accounts] of allCategories) {
      const match = accounts.find(a => words.some(w => a.toLowerCase().includes(w)));
      if (match) return { tracker, account: match };
    }
    return undefined;
  };

  // --- Command Bar: Parser ---
  const parseCommand = (input: string): { action: any; message: string } | { error: string } => {
    const trimmed = input.trim();
    if (!trimmed) return { error: "Type a command. Try 'help' for options." };

    const lower = trimmed.toLowerCase();
    const words = lower.split(/\s+/);

    // Extract dollar amount (with optional $ prefix and commas)
    const amountMatch = trimmed.match(/\$?([\d,]+\.?\d*)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined;

    // Extract date (YYYY-MM-DD or common formats)
    const dateMatch = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
    const today = new Date().toISOString().split('T')[0];

    // --- HELP ---
    if (words[0] === 'help') {
      return { error: [
        "Commands:",
        "  pay <bill>              Mark a bill as paid",
        "  pay <bill> <amount>     Pay bill with specific amount",
        "  unpay <bill>            Mark a bill as unpaid",
        "  balance <amount>        Set current balance",
        "  <account> <amount>      Update any account balance",
        "  income <source> <amt>   Log income",
        "  add <name> <amount>     Add a new bill",
        "  delete <bill>           Delete a bill",
        "  debt <card> <amount>    Log a credit card payment",
      ].join("\n") };
    }

    // --- PAY / POSTED / CLEARED ---
    if (words[0] === 'pay' || lower.includes('posted') || lower.includes('cleared')) {
      const searchText = lower
        .replace(/^pay\s+/, '')
        .replace(/\s*(posted|cleared)\s*/, ' ')
        .replace(/\$?[\d,]+\.?\d*/g, '')
        .replace(/\d{4}-\d{2}-\d{2}/g, '')
        .trim();
      const bill = findBill(searchText);
      if (!bill) return { error: `Could not find a bill matching "${searchText}". Check your spelling.` };
      return {
        action: { calls: [{ name: 'toggleBillStatus', args: { name: bill.name, paid: true, amount: amount ?? bill.amount, date: dateMatch?.[1] ?? today }, id: `cmd-${Date.now()}` }] },
        message: `Pay ${bill.name} — ${formatMoney(amount ?? bill.amount)}`
      };
    }

    // --- UNPAY ---
    if (words[0] === 'unpay') {
      const searchText = lower.replace(/^unpay\s+/, '').trim();
      const bill = findBill(searchText);
      if (!bill) return { error: `Could not find a bill matching "${searchText}".` };
      return {
        action: { calls: [{ name: 'toggleBillStatus', args: { name: bill.name, paid: false, amount: bill.amount, date: bill.date ?? '' }, id: `cmd-${Date.now()}` }] },
        message: `Unpay ${bill.name}`
      };
    }

    // --- BALANCE ---
    if (words[0] === 'balance' && amount !== undefined) {
      return {
        action: { calls: [{ name: 'updateCurrentBalance', args: { amount }, id: `cmd-${Date.now()}` }] },
        message: `Set balance to ${formatMoney(amount)}`
      };
    }

    // --- INCOME ---
    if (words[0] === 'income') {
      const rest = trimmed.slice(6).trim();
      const incomeAmountMatch = rest.match(/\$?([\d,]+\.?\d*)/);
      const incomeAmount = incomeAmountMatch ? parseFloat(incomeAmountMatch[1].replace(/,/g, '')) : undefined;
      if (!incomeAmount) return { error: "Usage: income <source> <amount> [description]" };
      const beforeAmount = rest.slice(0, rest.indexOf(incomeAmountMatch![0])).trim();
      const afterAmount = rest.slice(rest.indexOf(incomeAmountMatch![0]) + incomeAmountMatch![0].length).trim();
      const source = beforeAmount || 'Miscellaneous';
      // Match against income categories
      const matched = DEFAULT_CATEGORIES.income.find(s => s.toLowerCase().includes(source.toLowerCase())) || source;
      return {
        action: { calls: [{ name: 'addFlow', args: { tracker: 'income', account: matched, amount: incomeAmount, description: afterAmount || undefined, date: dateMatch?.[1] ?? today }, id: `cmd-${Date.now()}` }] },
        message: `Log ${formatMoney(incomeAmount)} income from ${matched}`
      };
    }

    // --- ADD BILL ---
    if (words[0] === 'add') {
      const rest = trimmed.slice(3).trim();
      const addAmountMatch = rest.match(/\$?([\d,]+\.?\d*)/);
      const addAmount = addAmountMatch ? parseFloat(addAmountMatch[1].replace(/,/g, '')) : undefined;
      if (!addAmount) return { error: "Usage: add <bill name> <amount>" };
      const name = rest.slice(0, rest.indexOf(addAmountMatch![0])).trim();
      if (!name) return { error: "Usage: add <bill name> <amount>" };
      const phase = new Date().getDate() <= 15 ? '1' : '2';
      return {
        action: { calls: [{ name: 'addBill', args: { name, amount: addAmount, phase }, id: `cmd-${Date.now()}` }] },
        message: `Add bill "${name}" — ${formatMoney(addAmount)}`
      };
    }

    // --- DELETE ---
    if (words[0] === 'delete' || words[0] === 'remove') {
      const searchText = lower.replace(/^(delete|remove)\s+/, '').trim();
      const bill = findBill(searchText);
      if (!bill) return { error: `Could not find a bill matching "${searchText}".` };
      return {
        action: { calls: [{ name: 'deleteBill', args: { name: bill.name }, id: `cmd-${Date.now()}` }] },
        message: `Delete bill "${bill.name}"`
      };
    }

    // --- DEBT PAYMENT ---
    if (words[0] === 'debt' && amount !== undefined) {
      const searchText = lower.replace(/^debt\s+/, '').replace(/\$?[\d,]+\.?\d*/g, '').trim();
      const card = CREDIT_CARDS.find(c => c.toLowerCase().includes(searchText)) || CREDIT_CARDS[0];
      return {
        action: { calls: [{ name: 'addDebtPayment', args: { account: card, amount }, id: `cmd-${Date.now()}` }] },
        message: `Log ${formatMoney(amount)} payment on ${card}`
      };
    }

    // --- GENERIC: <account/bill name> <amount> → update snapshot or pay bill ---
    if (amount !== undefined) {
      const searchText = lower.replace(/\$?[\d,]+\.?\d*/g, '').replace(/\d{4}-\d{2}-\d{2}/g, '').trim();
      // Try account first
      const acct = findAccount(searchText);
      if (acct) {
        return {
          action: { calls: [{ name: 'updateSnapshot', args: { tracker: acct.tracker, account: acct.account, amount }, id: `cmd-${Date.now()}` }] },
          message: `Update ${acct.account} to ${formatMoney(amount)}`
        };
      }
      // Try bill
      const bill = findBill(searchText);
      if (bill) {
        return {
          action: { calls: [{ name: 'toggleBillStatus', args: { name: bill.name, paid: true, amount, date: dateMatch?.[1] ?? today }, id: `cmd-${Date.now()}` }] },
          message: `Pay ${bill.name} — ${formatMoney(amount)}`
        };
      }
    }

    return { error: `Couldn't understand "${trimmed}". Type 'help' for available commands.` };
  };

  // --- Command Execution ---
  const executeCommand = (input: string) => {
    const result = parseCommand(input);
    if ('error' in result) {
      setCommandHistory(prev => [...prev, { input, result: result.error, success: false }]);
      return;
    }
    setCommandHistory(prev => [...prev, { input, result: result.message, success: true }]);
    setPendingAction(result.action);
  };

  // --- Action Handlers ---
  const handleApproveAction = async () => {
    const action = pendingActionRef.current;
    if (!action) return;

    try {
      for (const call of action.calls) {
        const args = { ...call.args };
        if (args.amount !== undefined) args.amount = parseFloat(args.amount) || 0;
        const name = call.name;

        if (name === "addBill") addBillLocal(args.name, args.amount, parseInt(args.phase));
        else if (name === "toggleBillStatus") {
          const currentBills = billsRef.current;
          const searchName = args.name.toLowerCase();
          let bill = currentBills.find(b => b.name.toLowerCase() === searchName);
          if (!bill) bill = currentBills.find(b => b.name.toLowerCase().includes(searchName));
          if (bill) {
            const updatedBills = currentBills.map(b =>
              b.id === bill!.id ? { ...b, paid: args.paid ?? true, amount: args.amount ?? b.amount, date: args.date ?? b.date } : b
            );
            saveToLocal(`bills_${activeMonth}`, updatedBills);
          }
        }
        else if (name === "updateBillAmount") {
          const bill = bills.find(b => b.name.toLowerCase().includes(args.name.toLowerCase()));
          if (bill) updateBillLocal(bill.id, { amount: args.amount });
        }
        else if (name === "addFlow") addFlowLocal(args.tracker, args.account, args.amount, args.description, args.date);
        else if (name === "updateSnapshot") addSnapshotLocal(args.tracker, args.account, args.amount);
        else if (name === "updateCurrentBalance") updateBalance(args.amount);
        else if (name === "addDebtPayment") addDebtPaymentLocal(args.account, args.amount);
        else if (name === "addGlobalExpense") {
          const newExp: GlobalExpense = { id: Date.now(), name: args.name, amount: args.amount, paid: false };
          saveToLocal('global_expenses', [...expenses, newExp]);
        }
        else if (name === "deleteBill") {
          const bill = bills.find(b => b.name.toLowerCase().includes(args.name.toLowerCase()));
          if (bill) saveToLocal(`bills_${activeMonth}`, bills.filter(b => b.id !== bill.id));
        }
      }
      setCommandHistory(prev => [...prev, { input: '', result: 'Prosecuted. Records updated.', success: true }]);
      setPendingAction(null);
    } catch (err) {
      console.error("Error executing action:", err);
      setCommandHistory(prev => [...prev, { input: '', result: `Error: ${err}`, success: false }]);
    }
  };

  const handleRejectAction = () => {
    setPendingAction(null);
    setCommandHistory(prev => [...prev, { input: '', result: 'Action cancelled.', success: false }]);
  };

  // --- UI Helpers ---
  const saveToLocal = async (key: string, data: any) => {
    try {
      const response = await fetch('/api/data');
      const allData = await response.json();
      const updatedData = { ...allData, [key]: data };
      
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      fetchData();
    } catch (err) {
      console.error("Failed to save data:", err);
    }
  };

  const toggleBillPaid = (id: number, isPaid: boolean) => {
    const updated = bills.map(b => b.id === id ? { ...b, paid: isPaid } : b);
    saveToLocal(`bills_${activeMonth}`, updated);
  };

  const updateBalance = async (newBalance: number) => {
    try {
      const response = await fetch('/api/data');
      const allData = await response.json();
      const updatedData = { ...allData, current_balance: String(newBalance) };
      
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      fetchData();
    } catch (err) {
      console.error("Failed to update balance:", err);
    }
  };

  const addBillLocal = (name: string, amount: number, phase: number) => {
    const newBill: Bill = { id: Date.now(), name, amount, phase, paid: false, month: activeMonth };
    saveToLocal(`bills_${activeMonth}`, [...bills, newBill]);
  };

  const updateBillLocal = (id: number, updates: Partial<Bill>) => {
    const updated = bills.map(b => b.id === id ? { ...b, ...updates } : b);
    saveToLocal(`bills_${activeMonth}`, updated);
  };

  const sortBills = (billsList: Bill[]) => {
    return [...billsList].sort((a, b) => {
      if (!a.date && !b.date) return a.name.localeCompare(b.name);
      if (!a.date) return 1;
      if (!b.date) return -1;

      // Try parsing as ISO date first
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();

      if (!isNaN(dateA) && !isNaN(dateB)) {
        return dateA - dateB;
      }

      // Fallback for legacy "Feb 15" format
      const getDay = (d: string) => {
        const match = d.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      };

      const dayA = getDay(a.date);
      const dayB = getDay(b.date);

      if (dayA !== dayB) return dayA - dayB;
      return a.name.localeCompare(b.name);
    });
  };

  const addSnapshotLocal = (tracker: Snapshot['tracker'], account: string, amount: number) => {
    const newSnapshot: Snapshot = { id: Date.now(), tracker, account, amount, month: activeMonth };
    const filtered = snapshots.filter(s => !(s.account === account && s.tracker === tracker));
    saveToLocal(`snapshots_${activeMonth}`, [...filtered, newSnapshot]);
  };

  const addFlowLocal = (tracker: Flow['tracker'], account: string, amount: number, description?: string, date?: string) => {
    const newFlow: Flow = { 
      id: Date.now(), 
      tracker, 
      account, 
      amount, 
      description, 
      month: activeMonth, 
      date: date || new Date().toISOString().split('T')[0] 
    };
    saveToLocal(`flows_${activeMonth}`, [...flows, newFlow]);
  };

  const addDebtPaymentLocal = async (account: string, amount: number, date?: string) => {
    try {
      const response = await fetch('/api/data');
      const allData = await response.json();
      
      const currentBills = allData[`bills_${activeMonth}`] || [];
      const currentSnapshots = allData[`snapshots_${activeMonth}`] || [];
      
      // 1. Add as a bill
      const newBill: Bill = { 
        id: Date.now(), 
        name: `${account} Payment`, 
        amount, 
        phase: new Date(date || new Date()).getDate() <= 15 ? 1 : 2, 
        paid: true, 
        month: activeMonth,
        date: date || new Date().toISOString().split('T')[0]
      };
      
      // 2. Update snapshots
      const updatedSnapshots = currentSnapshots.map((s: any) => {
        if (s.tracker === 'debt' && s.account === account) {
          return { ...s, amount: Math.max(0, s.amount - amount) };
        }
        return s;
      });
      
      const updatedData = {
        ...allData,
        [`bills_${activeMonth}`]: [...currentBills, newBill],
        [`snapshots_${activeMonth}`]: updatedSnapshots
      };
      
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData)
      });
      
      fetchData();
    } catch (err) {
      console.error("Failed to add debt payment:", err);
    }
  };

  const saveBackupEmail = async (email: string) => {
    setIsSavingEmail(true);
    try {
      const response = await fetch('/api/data');
      const allData = await response.json();
      allData['backup_email'] = email;
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allData)
      });
      setBackupEmail(email);
      alert("Backup email updated!");
    } catch (err) {
      alert("Failed to update backup email.");
    } finally {
      setIsSavingEmail(false);
    }
  };

  // --- Renderers ---
  const renderHome = () => {
    const today = new Date();
    const sysPhase = today.getDate() <= 15 ? 1 : 2;
    const unpaidTargetBills = bills.filter(b => b.phase === sysPhase && !b.paid);
    const unpaidTargetTotal = unpaidTargetBills.reduce((s, b) => s + b.amount, 0);
    const guiltFree = (summary?.income || 0) - (summary?.taxes || 0) - (summary?.billsTotal || 0);

    const currentYear = activeMonth.split('-')[0];
    const ytdIncome = rawDbData ? Object.keys(rawDbData)
      .filter(key => key.startsWith('flows_') && key.includes(currentYear))
      .reduce((total, key) => {
        const flows = rawDbData[key] || [];
        return total + flows.filter((f: any) => f.tracker === 'income').reduce((s: number, f: any) => s + f.amount, 0);
      }, 0) : 0;

    const ccDebt = snapshots
      .filter(s => s.tracker === 'debt' && CREDIT_CARDS.some(cc => s.account.includes(cc)))
      .reduce((s, i) => s + i.amount, 0);

    return (
      <div className="space-y-4">
        <div className="bills-card">
          <div className="text-xs text-text-muted font-extrabold uppercase tracking-wider">You Should Have (Phase {sysPhase} Unpaid)</div>
          <div className="text-4xl font-black mt-2">{formatMoney(unpaidTargetTotal)}</div>
          
          <div className="mt-6">
            <div className="text-xs text-text-muted font-bold">CURRENT BALANCE</div>
            <div className="flex justify-between items-end mt-2">
              <div className="flex-1">
                {isEditingBalance ? (
                  <input 
                    autoFocus
                    type="number" 
                    value={currentBalance} 
                    onChange={(e) => setCurrentBalance(parseFloat(e.target.value) || 0)}
                    onBlur={(e) => {
                      updateBalance(parseFloat(e.target.value) || 0);
                      setIsEditingBalance(false);
                    }}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="text-3xl font-black bg-transparent border-none focus:outline-none w-full"
                  />
                ) : (
                  <div 
                    onClick={() => setIsEditingBalance(true)}
                    className="text-3xl font-black cursor-pointer hover:text-accent-blue transition-colors"
                  >
                    {formatMoney(currentBalance)}
                  </div>
                )}
                <div className="text-xs text-accent-orange mt-1 font-bold italic uppercase">Tap to Edit</div>
              </div>
              <button className="bills-btn-small" onClick={() => fetchData()}>REFRESH</button>
            </div>
          </div>
          
          <div className="bills-row mt-4 border-t border-border-subtle pt-4">
            <div className="text-sm font-bold">AVAILABLE FOR DEBT</div>
            <div className={`text-lg font-black ${currentBalance - unpaidTargetTotal >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {formatMoney(currentBalance - unpaidTargetTotal)}
            </div>
          </div>
        </div>

        {/* Quick Glance Totals */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Net Worth</div>
            <div className="text-xl font-black">
              {formatMoney(
                snapshots.filter(s => ['investment', 'savings', 'assumptions'].includes(s.tracker)).reduce((s, i) => s + i.amount, 0) -
                snapshots.filter(s => s.tracker === 'debt').reduce((s, i) => s + i.amount, 0)
              )}
            </div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Portfolio Value</div>
            <div className="text-xl font-black text-accent-blue">
              {formatMoney(snapshots.filter(s => s.tracker === 'investment').reduce((s, i) => s + i.amount, 0))}
            </div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">MTD Income</div>
            <div className="text-xl font-black text-accent-green">{formatMoney(summary?.income || 0)}</div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">YTD Income</div>
            <div className="text-xl font-black text-accent-green">{formatMoney(ytdIncome)}</div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Total Debt</div>
            <div className="text-xl font-black text-accent-red">
              {formatMoney(snapshots.filter(s => s.tracker === 'debt').reduce((s, i) => s + i.amount, 0))}
            </div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">CC Debt</div>
            <div className="text-xl font-black text-accent-red">{formatMoney(ccDebt)}</div>
          </div>
        </div>

        <div className="bills-card border-accent-green">
          <div className="text-xs text-accent-green font-black uppercase tracking-wider mb-1">Safe to Spend (Monthly)</div>
          <div className="text-xs text-text-muted mb-3 leading-tight">MTD Income minus Taxes and Monthly Bills.</div>
          <div className="text-4xl font-black text-accent-green">{formatMoney(guiltFree)}</div>
        </div>

        <div className="bills-card">
          <div className="text-xs text-text-muted font-bold mb-3 uppercase tracking-wider">Monthly Bills Progress</div>
          <div className="w-full bg-border-subtle rounded-full h-3 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${summary?.billsTotal ? (summary.billsPaid / summary.billsTotal) * 100 : 0}%` }}
              className="bg-accent-green h-full"
            />
          </div>
          <div className="text-xs text-right mt-2 font-black text-text-muted">
            {summary?.billsTotal ? Math.round((summary.billsPaid / summary.billsTotal) * 100) : 0}% Paid ({formatMoney(summary?.billsPaid || 0)} / {formatMoney(summary?.billsTotal || 0)})
          </div>
        </div>

        <div className="bills-card">
          <div className="text-xs text-text-muted font-bold mb-3 uppercase tracking-wider">Next Up (Unpaid Bills)</div>
          <div className="divide-y divide-border-subtle">
            {bills.filter(b => !b.paid).slice(0, 3).map(b => (
              <div key={b.id} className="py-3 flex justify-between items-center">
                <div>
                  <div className="font-black">{b.name}</div>
                  <div className="flex gap-2 items-center">
                    <div className={`text-[10px] font-bold uppercase ${b.phase === 1 ? 'text-accent-blue' : 'text-text-muted'}`}>Phase {b.phase}</div>
                    {b.date && (
                      <div className="text-[10px] text-text-muted font-bold uppercase">
                        • {isNaN(new Date(b.date).getTime()) ? b.date : new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-lg font-black">{formatMoney(b.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderBillsPage = () => (
    <div className="space-y-4">
      <div className="bills-card">
        <div className="flex justify-between items-center">
          <h2 className="font-black text-lg">Monthly Bills</h2>
          <div className="flex gap-2">
            <button 
              className="bills-btn-small text-accent-red border-accent-red"
              onClick={() => setActiveModal({ type: 'debt_payment', account: CREDIT_CARDS[0], amount: 0 })}
            >
              + DEBT PMT
            </button>
            <button 
              className="bills-btn-small text-accent-blue border-accent-blue"
              onClick={() => setActiveModal({ type: 'bill', name: '', amount: 0, phase: 1 })}
            >
              + BILL
            </button>
          </div>
        </div>
      </div>

      <div className="bills-card">
        <div className="flex justify-between items-center mb-4">
          <div className="text-xs text-text-muted font-bold uppercase tracking-wider">Phase 1 (1st - 15th)</div>
          <div className="text-xs font-black text-accent-blue">{formatMoney(bills.filter(b => b.phase === 1).reduce((s, b) => s + b.amount, 0))}</div>
        </div>
        <div className="divide-y divide-border-subtle">
          {sortBills(bills.filter(b => b.phase === 1)).map(b => (
            <div key={b.id} className="py-3 flex items-center gap-4">
              <input 
                type="checkbox" 
                checked={b.paid} 
                onChange={(e) => {
                  e.stopPropagation();
                  setActiveModal({ 
                    type: 'bill', 
                    id: b.id, 
                    name: b.name, 
                    amount: b.amount, 
                    phase: b.phase, 
                    date: b.date, 
                    paid: !b.paid 
                  });
                }}
                className="toggle-switch"
              />
              <div 
                className="flex-1 flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors"
                onClick={() => setActiveModal({ type: 'bill', id: b.id, name: b.name, amount: b.amount, phase: b.phase, date: b.date, paid: b.paid })}
              >
                <div>
                  <div className={`font-black ${b.paid ? 'line-through text-text-muted' : ''}`}>{b.name}</div>
                  {b.date && (
                    <div className="text-[10px] text-text-muted font-bold uppercase">
                      {isNaN(new Date(b.date).getTime()) ? b.date : new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
                <div className={`font-black text-lg ${b.paid ? 'line-through text-text-muted' : ''}`}>{formatMoney(b.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bills-card">
        <div className="flex justify-between items-center mb-4">
          <div className="text-xs text-text-muted font-bold uppercase tracking-wider">Phase 2 (16th - End)</div>
          <div className="text-xs font-black text-accent-blue">{formatMoney(bills.filter(b => b.phase === 2).reduce((s, b) => s + b.amount, 0))}</div>
        </div>
        <div className="divide-y divide-border-subtle">
          {sortBills(bills.filter(b => b.phase === 2)).map(b => (
            <div key={b.id} className="py-3 flex items-center gap-4">
              <input 
                type="checkbox" 
                checked={b.paid} 
                onChange={(e) => {
                  e.stopPropagation();
                  setActiveModal({ 
                    type: 'bill', 
                    id: b.id, 
                    name: b.name, 
                    amount: b.amount, 
                    phase: b.phase, 
                    date: b.date, 
                    paid: !b.paid 
                  });
                }}
                className="toggle-switch"
              />
              <div 
                className="flex-1 flex justify-between items-center cursor-pointer hover:bg-white/5 p-1 rounded-lg transition-colors"
                onClick={() => setActiveModal({ type: 'bill', id: b.id, name: b.name, amount: b.amount, phase: b.phase, date: b.date, paid: b.paid })}
              >
                <div>
                  <div className={`font-black ${b.paid ? 'line-through text-text-muted' : ''}`}>{b.name}</div>
                  {b.date && (
                    <div className="text-[10px] text-text-muted font-bold uppercase">
                      {isNaN(new Date(b.date).getTime()) ? b.date : new Date(b.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
                <div className={`font-black text-lg ${b.paid ? 'line-through text-text-muted' : ''}`}>{formatMoney(b.amount)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSnapshotsPage = (tracker: Snapshot['tracker'], title: string) => {
    const items = snapshots.filter(s => s.tracker === tracker);
    const total = items.reduce((s, i) => s + i.amount, 0);
    const chartData = getHistoricalData(tracker);

    let federalTotal = 0;
    let stateTotal = 0;
    if (tracker === 'tax') {
      federalTotal = items.filter(s => s.account.toLowerCase().includes('federal')).reduce((s, i) => s + i.amount, 0);
      stateTotal = items.filter(s => s.account.toLowerCase().includes('state')).reduce((s, i) => s + i.amount, 0);
    }

    return (
      <div className="space-y-4">
        <div className="bills-card">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-black text-lg">{title}</h2>
              <div className="text-2xl font-black text-accent-blue">{formatMoney(total)}</div>
            </div>
            <button 
              className="bills-btn-small text-accent-blue border-accent-blue"
              onClick={() => setActiveModal({ type: 'snapshot', tracker, account: (DEFAULT_CATEGORIES as any)[tracker][0], amount: 0 })}
            >
              + UPDATE
            </button>
          </div>
        </div>

        {chartData.length > 1 && (
          <div className="bills-card h-[200px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 800, fill: 'rgba(255,255,255,0.3)' }}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorValue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {tracker === 'tax' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bills-card">
              <div className="text-[10px] font-black text-text-muted uppercase mb-1">Federal Total</div>
              <div className="text-xl font-black text-accent-red">{formatMoney(federalTotal)}</div>
            </div>
            <div className="bills-card">
              <div className="text-[10px] font-black text-text-muted uppercase mb-1">State Total</div>
              <div className="text-xl font-black text-accent-orange">{formatMoney(stateTotal)}</div>
            </div>
          </div>
        )}

        <div className="bills-card">
          <div className="divide-y divide-border-subtle">
            {(DEFAULT_CATEGORIES as any)[tracker]?.map((account: string) => {
              const snapshot = items.find(s => s.account === account);
              return (
                <div key={account} className="py-4 flex justify-between items-center">
                  <div className="font-bold">{account}</div>
                  <div 
                    className="text-lg font-black cursor-pointer hover:text-accent-blue"
                    onClick={() => {
                      setActiveModal({ 
                        type: 'snapshot', 
                        tracker, 
                        account, 
                        amount: snapshot?.amount || 0 
                      });
                    }}
                  >
                    {formatMoney(snapshot?.amount || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {tracker === 'debt' && (
          <div className="bills-card">
            <h3 className="text-xs font-black text-text-muted uppercase tracking-widest mb-4">Payment History ({activeMonth})</h3>
            <div className="divide-y divide-border-subtle">
              {bills.filter(b => b.name.toLowerCase().includes('payment') && CREDIT_CARDS.some(cc => b.name.includes(cc))).map(p => (
                <div key={p.id} className="py-3 flex justify-between items-center">
                  <div>
                    <div className="font-black text-sm">{p.name}</div>
                    <div className="text-[10px] text-accent-green font-bold uppercase">
                      {p.date ? new Date(p.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No Date'} • POSTED
                    </div>
                  </div>
                  <div className="text-lg font-black text-accent-green">{formatMoney(p.amount)}</div>
                </div>
              ))}
              {bills.filter(b => b.name.toLowerCase().includes('payment') && CREDIT_CARDS.some(cc => b.name.includes(cc))).length === 0 && (
                <div className="py-8 text-center text-text-muted italic text-xs">No payments recorded this month.</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFlowsPage = (tracker: Flow['tracker'], title: string) => {
    const items = flows.filter(f => f.tracker === tracker);
    const total = items.reduce((s, i) => s + i.amount, 0);

    // Group by account for buckets, filtering out zero amounts
    const buckets = items.reduce((acc, flow) => {
      if (flow.amount !== 0) {
        acc[flow.account] = (acc[flow.account] || 0) + flow.amount;
      }
      return acc;
    }, {} as Record<string, number>);

    // Sort items chronologically (newest first)
    const sortedItems = [...items].filter(f => f.amount !== 0).sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());

    return (
      <div className="space-y-4">
        <div className="bills-card">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-black text-lg">{title}</h2>
              <div className="text-2xl font-black text-accent-green">{formatMoney(total)}</div>
            </div>
            <button 
              className="bills-btn-small text-accent-green border-accent-green"
              onClick={() => setActiveModal({ 
                type: 'flow', 
                tracker, 
                account: (DEFAULT_CATEGORIES as any)[tracker][0], 
                amount: 0, 
                description: '',
                date: new Date().toISOString().split('T')[0]
              })}
            >
              + LOG
            </button>
          </div>
        </div>

        {/* Buckets Section */}
        {Object.keys(buckets).length > 0 && (
          <div className="bills-card">
            <h3 className="font-black mb-4 uppercase text-xs tracking-widest text-text-muted">Income Buckets</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(buckets).map(([account, amount]) => (
                <div key={account} className="bg-bg-main p-3 rounded-xl border border-border-subtle">
                  <div className="text-[10px] font-black text-text-muted uppercase mb-1 truncate">{account}</div>
                  <div className="text-sm font-black text-accent-green">{formatMoney(amount)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chronological List */}
        <div className="bills-card">
          <h3 className="font-black mb-4 uppercase text-xs tracking-widest text-text-muted">Recent Payments</h3>
          <div className="divide-y divide-border-subtle">
            {sortedItems.map(flow => (
              <div 
                key={flow.id} 
                className="py-4 flex justify-between items-center cursor-pointer hover:bg-white/5 px-2 -mx-2 rounded-lg transition-colors"
                onClick={() => setActiveModal({
                  type: 'flow',
                  id: flow.id,
                  tracker: flow.tracker,
                  account: flow.account,
                  amount: flow.amount,
                  description: flow.description,
                  date: flow.date
                })}
              >
                <div>
                  <div className="font-black">{flow.account}</div>
                  <div className="text-xs text-text-muted flex items-center gap-2">
                    <span>{flow.date}</span>
                    {flow.description && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-border-subtle" />
                        <span>{flow.description}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-lg font-black">{formatMoney(flow.amount)}</div>
              </div>
            ))}
            {sortedItems.length === 0 && <div className="py-8 text-center text-text-muted italic">No {tracker} entries yet this month.</div>}
          </div>
        </div>
      </div>
    );
  };

  const renderNetWorthPage = () => {
    const assets = snapshots.filter(s => ['investment', 'savings', 'assumptions'].includes(s.tracker)).reduce((s, i) => s + i.amount, 0);
    const liabilities = snapshots.filter(s => s.tracker === 'debt').reduce((s, i) => s + i.amount, 0);
    const netWorth = assets - liabilities;
    const chartData = getHistoricalData('networth');

    return (
      <div className="space-y-4">
        <div className="bills-card bg-accent-blue/10 border-accent-blue">
          <div className="text-xs font-black text-accent-blue uppercase tracking-widest mb-2">Total Net Worth</div>
          <div className="text-5xl font-black">{formatMoney(netWorth)}</div>
        </div>

        {chartData.length > 1 && (
          <div className="bills-card h-[200px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorNW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 800, fill: 'rgba(255,255,255,0.3)' }}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorNW)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Total Assets</div>
            <div className="text-xl font-black text-accent-green">{formatMoney(assets)}</div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Total Debt</div>
            <div className="text-xl font-black text-accent-red">{formatMoney(liabilities)}</div>
          </div>
        </div>

        <div className="bills-card">
          <h3 className="font-black mb-4 uppercase text-xs tracking-widest text-text-muted">Breakdown</h3>
          <div className="space-y-4">
            {['investment', 'savings', 'debt', 'assumptions'].map(tracker => {
              const total = snapshots.filter(s => s.tracker === tracker).reduce((s, i) => s + i.amount, 0);
              return (
                <div key={tracker} className="flex justify-between items-center">
                  <div className="font-bold capitalize">{tracker}</div>
                  <div className="font-black">{formatMoney(total)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bills-card">
          <h3 className="font-black mb-4 uppercase text-xs tracking-widest text-text-muted">Market Assumptions</h3>
          <div className="divide-y divide-border-subtle">
            {DEFAULT_CATEGORIES.assumptions.map(account => {
              const snapshot = snapshots.find(s => s.tracker === 'assumptions' && s.account === account);
              return (
                <div key={account} className="py-4 flex justify-between items-center">
                  <div className="font-bold">{account}</div>
                  <div 
                    className="text-lg font-black cursor-pointer hover:text-accent-blue"
                    onClick={() => setActiveModal({ type: 'snapshot', tracker: 'assumptions', account, amount: snapshot?.amount || 0 })}
                  >
                    {formatMoney(snapshot?.amount || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderExpensesPage = () => (
    <div className="space-y-4">
      <div className="bills-card">
        <div className="flex justify-between items-center">
          <h2 className="font-black text-lg">Global Expenses</h2>
          <button 
            className="bills-btn-small text-accent-orange border-accent-orange"
            onClick={() => setActiveModal({ type: 'expense', name: '', amount: 0 })}
          >
            + EXPENSE
          </button>
        </div>
      </div>

      <div className="bills-card">
        <div className="divide-y divide-border-subtle">
          {expenses.map(exp => (
            <div key={exp.id} className="py-4 flex items-center gap-4">
              <input 
                type="checkbox" 
                checked={exp.paid} 
                onChange={(e) => {
                  e.stopPropagation();
                  const updated = expenses.map(e => e.id === exp.id ? { ...e, paid: !exp.paid } : e);
                  saveToLocal('global_expenses', updated);
                }}
                className="toggle-switch"
              />
              <div 
                className="flex-1 flex justify-between items-center cursor-pointer hover:bg-white/5 px-2 -mx-2 rounded-lg transition-colors"
                onClick={() => setActiveModal({ type: 'expense', id: exp.id, name: exp.name, amount: exp.amount })}
              >
                <div className={`font-black ${exp.paid ? 'line-through text-text-muted' : ''}`}>{exp.name}</div>
                <div className={`font-black text-lg ${exp.paid ? 'line-through text-text-muted' : ''}`}>{formatMoney(exp.amount)}</div>
              </div>
            </div>
          ))}
          {expenses.length === 0 && <div className="py-8 text-center text-text-muted italic">No global expenses tracked.</div>}
        </div>
      </div>
    </div>
  );

  const renderYearlyReport = () => {
    if (!rawDbData) return null;
    const currentYear = activeMonth.split('-')[0];
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    
    const yearlyData = months.map(m => {
      const monthKey = `${currentYear}-${m}`;
      const snapshots = rawDbData[`snapshots_${monthKey}`] || [];
      const flows = rawDbData[`flows_${monthKey}`] || [];
      
      const income = flows.filter((f: any) => f.tracker === 'income').reduce((s: number, f: any) => s + f.amount, 0);
      const retirement = snapshots.filter((s: any) => s.tracker === 'retirement').reduce((s: number, i: any) => s + i.amount, 0);
      const debt = snapshots.filter((s: any) => s.tracker === 'debt').reduce((s: number, i: any) => s + i.amount, 0);
      const investment = snapshots.filter((s: any) => s.tracker === 'investment').reduce((s: number, i: any) => s + i.amount, 0);
      const assets = snapshots.filter((s: any) => ['investment', 'savings', 'assumptions'].includes(s.tracker)).reduce((s: number, i: any) => s + i.amount, 0);
      
      return {
        month: m,
        monthName: new Date(2000, parseInt(m)-1).toLocaleString('default', {month: 'short'}),
        income,
        retirement,
        debt,
        investment,
        netWorth: assets - debt
      };
    });

    const activeMonths = yearlyData.filter(d => d.income > 0 || d.netWorth !== 0);
    const totalIncome = yearlyData.reduce((s, d) => s + d.income, 0);
    const totalRetirement = yearlyData.reduce((s, d) => s + d.retirement, 0);
    
    const startDebt = activeMonths[0]?.debt || 0;
    const endDebt = activeMonths[activeMonths.length - 1]?.debt || 0;
    const debtReduction = startDebt - endDebt;

    const startNW = activeMonths[0]?.netWorth || 0;
    const endNW = activeMonths[activeMonths.length - 1]?.netWorth || 0;
    const nwGrowth = endNW - startNW;

    return (
      <div className="space-y-6">
        <div className="bills-card border-accent-blue">
          <h2 className="text-2xl font-black uppercase tracking-tight mb-1">{currentYear} Financial Review</h2>
          <p className="text-xs text-text-muted font-bold uppercase tracking-widest">Year-End Performance Summary</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Total Income</div>
            <div className="text-xl font-black text-accent-green">{formatMoney(totalIncome)}</div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Net Worth Growth</div>
            <div className="text-xl font-black text-accent-blue">{formatMoney(nwGrowth)}</div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Debt Change</div>
            <div className={`text-xl font-black ${debtReduction >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
              {debtReduction >= 0 ? '-' : '+'}{formatMoney(Math.abs(debtReduction))}
            </div>
          </div>
          <div className="bills-card">
            <div className="text-[10px] font-black text-text-muted uppercase mb-1">Avg Monthly Income</div>
            <div className="text-xl font-black">{formatMoney(totalIncome / activeMonths.length || 0)}</div>
          </div>
        </div>

        <div className="bills-card">
          <h3 className="font-black mb-6 uppercase text-xs tracking-widest text-text-muted">Monthly Progression</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activeMonths}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="monthName" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 800, fill: 'rgba(255,255,255,0.3)' }}
                />
                <YAxis hide />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="netWorth" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={3} name="Net Worth" />
                <Area type="monotone" dataKey="income" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={3} name="Income" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bills-card">
          <h3 className="font-black mb-4 uppercase text-xs tracking-widest text-text-muted">Yearly Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-border-subtle">
              <span className="font-bold text-sm">Total Retirement Contributions</span>
              <span className="font-black text-accent-blue">{formatMoney(totalRetirement)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border-subtle">
              <span className="font-bold text-sm">Total Debt Reduction</span>
              <span className="font-black text-accent-green">{formatMoney(Math.max(0, debtReduction))}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="font-bold text-sm">Savings Rate (Est.)</span>
              <span className="font-black text-accent-orange">
                {totalIncome > 0 ? Math.round((totalRetirement / totalIncome) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettingsPage = () => {
    const handleExport = async () => {
      window.location.href = '/api/export';
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          const response = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          
          if (response.ok) {
            const keys = Object.keys(data);
            const months = keys.filter(k => k.startsWith('bills_')).map(k => k.replace('bills_', ''));
            alert(`Data imported successfully!\n\nSummary:\n- Months: ${months.join(', ')}\n- Global items: ${keys.filter(k => !k.includes('_')).length}\n- Total keys: ${keys.length}`);
            fetchData();
          } else {
            alert("Failed to save imported data to server.");
          }
        } catch (err) {
          alert("Failed to import data. Invalid JSON file.");
        }
      };
      reader.readAsText(file);
    };

    const handleClearData = async () => {
      if (!confirm("ARE YOU SURE? This will permanently delete ALL data across ALL months. This cannot be undone.")) return;
      if (!confirm("LAST CHANCE: Are you absolutely positive?")) return;
      
      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        alert("Database cleared.");
        window.location.reload();
      } catch (err) {
        alert("Failed to clear database.");
      }
    };

    return (
      <div className="space-y-4">
        <div className="bills-card">
          <h2 className="font-black text-lg mb-4 uppercase tracking-tight">Data Management</h2>
          <p className="text-xs text-text-muted mb-6">Backup your data or restore it from a previous file. Your data is stored securely on the server.</p>
          
          <div className="space-y-3">
            <button 
              onClick={handleExport}
              className="w-full bills-btn flex items-center justify-center gap-3"
            >
              <Download size={20} />
              Export Backup (JSON)
            </button>
            
            <div className="relative">
              <input 
                type="file" 
                accept=".json" 
                onChange={handleImport}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <button className="w-full bills-btn border-accent-orange text-accent-orange flex items-center justify-center gap-3">
                <Upload size={20} />
                Import Backup (JSON)
              </button>
            </div>

            <button 
              onClick={handleClearData}
              className="w-full bills-btn border-accent-red text-accent-red flex items-center justify-center gap-3 opacity-50 hover:opacity-100 transition-opacity"
            >
              <Trash2 size={20} />
              Clear All Data
            </button>
          </div>
        </div>

        {rawDbData && (
          <div className="bills-card">
            <h2 className="font-black text-lg mb-4 uppercase tracking-tight">Database Inspector</h2>
            <div className="space-y-2">
              <div className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">Stored Keys</div>
              <div className="grid grid-cols-2 gap-2">
                {Object.keys(rawDbData).sort().map(key => (
                  <div key={key} className="bg-white/5 p-2 rounded-lg border border-white/5 flex justify-between items-center">
                    <span className="text-[10px] font-mono truncate mr-2">{key}</span>
                    <span className="text-[10px] font-black text-accent-blue">
                      {Array.isArray(rawDbData[key]) ? `${rawDbData[key].length} items` : 'Value'}
                    </span>
                  </div>
                ))}
              </div>
              {Object.keys(rawDbData).length === 0 && (
                <div className="text-xs text-text-muted italic py-4 text-center">Database is empty.</div>
              )}
            </div>
          </div>
        )}

        <div className="bills-card">
          <h2 className="font-black text-lg mb-4 uppercase tracking-tight">Automated Backups</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4 p-4 bg-accent-blue/5 rounded-2xl border border-accent-blue/10">
              <div className="w-10 h-10 bg-accent-blue/10 rounded-full flex items-center justify-center text-accent-blue shrink-0">
                <Mail size={20} />
              </div>
              <div>
                <div className="font-black text-sm mb-1">Monthly Email Backup</div>
                <p className="text-[10px] text-text-muted leading-relaxed">
                  On the 1st of every month, we'll automatically email you a full backup of your financial data. 
                  This backup contains <strong>all data</strong> input into the system thus far (all months, snapshots, and settings).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-muted uppercase px-1">Backup Destination Email</label>
              <div className="flex gap-2">
                <input 
                  type="email"
                  value={backupEmail}
                  onChange={(e) => setBackupEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="bills-input flex-1"
                />
                <button 
                  onClick={() => saveBackupEmail(backupEmail)}
                  disabled={isSavingEmail}
                  className="bills-btn-small border-accent-blue text-accent-blue min-w-[80px]"
                >
                  {isSavingEmail ? '...' : 'SAVE'}
                </button>
              </div>
              {!backupEmail && (
                <p className="text-[10px] text-accent-red font-bold uppercase px-1">Email not configured</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderModal = () => {
    if (!activeModal) return null;

    const handleSave = () => {
      if (activeModal.type === 'bill') {
        if (activeModal.id) {
          updateBillLocal(activeModal.id, { 
            name: activeModal.name, 
            amount: activeModal.amount, 
            phase: activeModal.phase,
            date: activeModal.date,
            paid: activeModal.paid
          });
        } else {
          if (activeModal.name && activeModal.amount) addBillLocal(activeModal.name, activeModal.amount, activeModal.phase || 1);
        }
      } else if (activeModal.type === 'snapshot') {
        if (activeModal.tracker && activeModal.account && !isNaN(activeModal.amount || 0)) {
          addSnapshotLocal(activeModal.tracker as any, activeModal.account, activeModal.amount || 0);
        }
      } else if (activeModal.type === 'flow') {
        if (activeModal.tracker && activeModal.account && activeModal.amount) {
          if (activeModal.id) {
            const updatedFlows = flows.map(f => {
              if (f.id === activeModal.id) {
                return {
                  ...f,
                  account: activeModal.account!,
                  amount: activeModal.amount!,
                  description: activeModal.description,
                  date: activeModal.date
                };
              }
              return f;
            });
            saveToLocal(`flows_${activeMonth}`, updatedFlows);
          } else {
            addFlowLocal(activeModal.tracker as any, activeModal.account, activeModal.amount, activeModal.description, activeModal.date);
          }
        }
      } else if (activeModal.type === 'debt_payment') {
        if (activeModal.account && activeModal.amount) addDebtPaymentLocal(activeModal.account, activeModal.amount, activeModal.date);
      } else if (activeModal.type === 'expense') {
        if (activeModal.name && activeModal.amount) {
          if (activeModal.id) {
            const updated = expenses.map(e => e.id === activeModal.id ? { ...e, name: activeModal.name!, amount: activeModal.amount! } : e);
            saveToLocal('global_expenses', updated);
          } else {
            const newExp: GlobalExpense = { id: Date.now(), name: activeModal.name, amount: activeModal.amount, paid: false };
            saveToLocal('global_expenses', [...expenses, newExp]);
          }
        }
      }
      setActiveModal(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSave();
      }
    };

    const handleDelete = () => {
      if (!activeModal?.id) return;
      
      if (activeModal.type === 'bill') {
        const updated = bills.filter(b => b.id !== activeModal.id);
        saveToLocal(`bills_${activeMonth}`, updated);
      } else if (activeModal.type === 'flow') {
        const updated = flows.filter(f => f.id !== activeModal.id);
        saveToLocal(`flows_${activeMonth}`, updated);
      } else if (activeModal.type === 'expense') {
        const updated = expenses.filter(e => e.id !== activeModal.id);
        saveToLocal('global_expenses', updated);
      }
      setActiveModal(null);
    };

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-bg-card w-full max-w-md rounded-2xl border border-border-subtle p-6 shadow-2xl"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black uppercase tracking-tight">
              {activeModal.type === 'bill' && (activeModal.id ? "Edit Bill" : "Add New Bill")}
              {activeModal.type === 'snapshot' && `Update ${activeModal.tracker}`}
              {activeModal.type === 'flow' && (activeModal.id ? `Edit ${activeModal.tracker}` : `Log ${activeModal.tracker}`)}
              {activeModal.type === 'debt_payment' && "Log Debt Payment"}
              {activeModal.type === 'expense' && "Add Global Expense"}
            </h2>
            <button onClick={() => setActiveModal(null)} className="text-text-muted hover:text-white"><X size={20} /></button>
          </div>

          <div className="space-y-4">
            {(activeModal.type === 'bill' || activeModal.type === 'expense') && (
              <div>
                <label className="text-[10px] font-black text-text-muted uppercase mb-1 block">Name</label>
                <input 
                  autoFocus={activeModal.type === 'bill' || activeModal.type === 'expense'}
                  type="text" 
                  value={activeModal.name || ''} 
                  onChange={(e) => setActiveModal({ ...activeModal, name: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={handleKeyDown}
                  className="bills-input w-full"
                  placeholder="e.g. Netflix"
                />
              </div>
            )}

            {(activeModal.type === 'snapshot' || activeModal.type === 'flow' || activeModal.type === 'debt_payment') && (
              <div>
                <label className="text-[10px] font-black text-text-muted uppercase mb-1 block">Account / Category</label>
                <select 
                  value={activeModal.account || ''} 
                  onChange={(e) => setActiveModal({ ...activeModal, account: e.target.value })}
                  className="bills-input w-full"
                >
                  {activeModal.type === 'debt_payment' ? (
                    CREDIT_CARDS.map(acc => <option key={acc} value={acc}>{acc}</option>)
                  ) : (
                    (DEFAULT_CATEGORIES as any)[activeModal.tracker || '']?.map((acc: string) => (
                      <option key={acc} value={acc}>{acc}</option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-text-muted uppercase mb-1 block">Amount</label>
              <input
                autoFocus={activeModal.type !== 'bill' && activeModal.type !== 'expense'}
                type="number"
                step="0.01"
                value={activeModal.amount === 0 ? '0' : (activeModal.amount || '')}
                onChange={(e) => setActiveModal({ ...activeModal, amount: parseFloat(e.target.value) || 0 })}
                onFocus={(e) => e.target.select()}
                onKeyDown={handleKeyDown}
                className="bills-input w-full"
                placeholder="0.00"
              />
            </div>

            {(activeModal.type === 'bill' || activeModal.type === 'flow' || activeModal.type === 'debt_payment') && (
              <div>
                <label className="text-[10px] font-black text-text-muted uppercase mb-1 block">
                  {activeModal.type === 'bill' ? 'Post Date (Optional)' : 'Date'}
                </label>
                <input 
                  type="date" 
                  value={activeModal.date || (activeModal.type === 'bill' ? '' : new Date().toISOString().split('T')[0])} 
                  onChange={(e) => setActiveModal({ ...activeModal, date: e.target.value })}
                  onKeyDown={handleKeyDown}
                  className="bills-input w-full"
                />
              </div>
            )}

            {activeModal.type === 'bill' && (
              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-border-subtle">
                <input 
                  type="checkbox" 
                  checked={activeModal.paid || false} 
                  onChange={(e) => setActiveModal({ ...activeModal, paid: e.target.checked })}
                  className="toggle-switch"
                />
                <label className="text-sm font-black uppercase tracking-tight">Mark as Paid</label>
              </div>
            )}

            {activeModal.type === 'bill' && (
              <div>
                <label className="text-[10px] font-black text-text-muted uppercase mb-1 block">Phase</label>
                <select 
                  value={activeModal.phase || 1} 
                  onChange={(e) => setActiveModal({ ...activeModal, phase: parseInt(e.target.value) })}
                  className="bills-input w-full"
                >
                  <option value={1}>Phase 1 (1st-15th)</option>
                  <option value={2}>Phase 2 (16th-End)</option>
                </select>
              </div>
            )}

            {activeModal.type === 'flow' && (
              <div>
                <label className="text-[10px] font-black text-text-muted uppercase mb-1 block">Description (Optional)</label>
                <input 
                  type="text" 
                  value={activeModal.description || ''} 
                  onChange={(e) => setActiveModal({ ...activeModal, description: e.target.value })}
                  onKeyDown={handleKeyDown}
                  className="bills-input w-full"
                  placeholder="Notes..."
                />
              </div>
            )}
          </div>

          <div className="mt-8 flex gap-3">
            {activeModal.id && (
              <button 
                onClick={handleDelete}
                className="flex-[0.5] py-3 font-bold text-accent-red border border-accent-red/30 rounded-xl hover:bg-accent-red/10 flex items-center justify-center"
                title="Delete Entry"
              >
                <Trash2 size={20} />
              </button>
            )}
            <button 
              onClick={() => setActiveModal(null)} 
              className="flex-1 py-3 font-bold text-text-muted border border-border-subtle rounded-xl hover:bg-white/5"
            >
              CANCEL
            </button>
            <button 
              onClick={handleSave} 
              className={`flex-1 py-3 font-black rounded-xl shadow-lg transition-all active:scale-95 ${
                activeModal.type === 'bill' ? 'bg-accent-blue text-bg-main shadow-accent-blue/20' :
                activeModal.type === 'expense' ? 'bg-accent-orange text-white shadow-accent-orange/20' :
                'bg-accent-green text-white shadow-accent-green/20'
              }`}
            >
              {activeModal.id ? "UPDATE" : "SAVE"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="min-h-screen pb-12">
      {renderModal()}
      {/* Header */}
      <header className="flex items-center p-4 bg-bg-card border-b border-border-subtle sticky top-0 z-40">
        <button onClick={() => setIsMenuOpen(true)} className="mr-4 text-2xl cursor-pointer">☰</button>
        <div className="text-xl font-black tracking-tight">Ryan's Finance Dashboard</div>
        <button
          onClick={() => setShowCommandPanel(true)}
          className="ml-auto w-10 h-10 bg-accent-blue rounded-full flex items-center justify-center text-bg-main shadow-lg shadow-accent-blue/20"
        >
          <MessageSquare size={20} />
        </button>
      </header>

      {/* Sidebar Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="fixed top-0 left-0 h-full w-[min(360px,86vw)] bg-bg-card border-r border-border-subtle z-50 p-4 overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="font-black text-sm uppercase tracking-widest text-text-muted">Menu</div>
                <button onClick={() => setIsMenuOpen(false)} className="text-accent-red font-bold text-xs">CLOSE</button>
              </div>
              
              <div className="bills-card">
                <div className="text-[10px] text-text-muted font-black uppercase mb-4 tracking-widest">Navigate</div>
                <div className="space-y-1">
                  {[
                    { id: 'home', label: 'Home', icon: Home },
                    { id: 'bills', label: 'Monthly Bills', icon: CreditCard },
                    { id: 'expenses', label: 'Upcoming Expenses', icon: TrendingDown },
                    { id: 'debt', label: 'Debt Snapshot', icon: BarChart3 },
                    { id: 'investment', label: 'Investments', icon: TrendingUp },
                    { id: 'savings', label: 'Savings Accounts', icon: PiggyBank },
                    { id: 'networth', label: 'Net Worth Tracker', icon: Wallet },
                    { id: 'income', label: 'Income Tracker', icon: TrendingUp },
                    { id: 'tax', label: 'Tax Withholdings', icon: History },
                    { id: 'retirement', label: 'Retirement Contributions', icon: PieChartIcon },
                    { id: 'yearly', label: 'Yearly Report', icon: BarChart3 },
                    { id: 'settings', label: 'Settings & Backup', icon: Settings },
                  ].map(item => (
                    <button 
                      key={item.id}
                      onClick={() => { setCurrentPage(item.id); setIsMenuOpen(false); }}
                      className="w-full flex justify-between items-center py-3 border-b border-border-subtle last:border-b-0 group"
                    >
                      <div className="flex items-center gap-3">
                        <item.icon size={18} className="text-text-muted group-hover:text-accent-blue transition-colors" />
                        <span className="font-bold">{item.label}</span>
                      </div>
                      <ChevronRight size={16} className="text-text-muted" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Active Period Selector */}
      <div className="p-4 max-w-xl mx-auto">
        <div className="bills-card">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="font-black text-text-muted text-xs uppercase tracking-widest">Active Period</div>
              <div className="text-[10px] text-accent-blue font-black mt-1 uppercase">Today: Phase {new Date().getDate() <= 15 ? '1' : '2'}</div>
            </div>
            <button className="bills-btn-small border-accent-blue text-accent-blue font-black" onClick={() => setCurrentPage('home')}>⌂ HOME</button>
          </div>
          <div className="flex gap-3">
            <select 
              value={activeMonth.split('-')[0]} 
              onChange={(e) => setActiveMonth(`${e.target.value}-${activeMonth.split('-')[1]}`)}
              className="bills-input flex-1 py-2 font-bold"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select 
              value={activeMonth.split('-')[1]} 
              onChange={(e) => setActiveMonth(`${activeMonth.split('-')[0]}-${e.target.value}`)}
              className="bills-input flex-1 py-2 font-bold"
            >
              {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => <option key={m} value={m}>{new Date(2000, parseInt(m)-1).toLocaleString('default', {month: 'long'})}</option>)}
            </select>
          </div>
          {lastSynced && (
            <div className="text-[10px] text-text-muted font-bold mt-2 text-right uppercase tracking-wider">
              Synced {lastSynced.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="p-4 max-w-xl mx-auto">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="animate-spin text-accent-blue w-10 h-10 mb-4" />
            <p className="text-text-muted font-bold animate-pulse">Loading your dashboard...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="bills-card border-accent-red">
            <h2 className="text-accent-red font-black mb-2">Connection Error</h2>
            <p className="text-sm text-text-muted mb-4">{error}</p>
            <button onClick={() => fetchData()} className="bills-btn">Retry Connection</button>
          </div>
        )}

        {!isLoading && !error && currentPage === 'home' && renderHome()}
        {!isLoading && !error && currentPage === 'bills' && renderBillsPage()}
        {!isLoading && !error && currentPage === 'expenses' && renderExpensesPage()}
        {!isLoading && !error && ['investment', 'debt', 'savings', 'assumptions', 'tax', 'retirement'].includes(currentPage) && renderSnapshotsPage(currentPage as any, currentPage.charAt(0).toUpperCase() + currentPage.slice(1))}
        {!isLoading && !error && ['income'].includes(currentPage) && renderFlowsPage(currentPage as any, currentPage.charAt(0).toUpperCase() + currentPage.slice(1))}
        {!isLoading && !error && currentPage === 'networth' && renderNetWorthPage()}
        {!isLoading && !error && currentPage === 'yearly' && renderYearlyReport()}
        {!isLoading && !error && currentPage === 'settings' && renderSettingsPage()}
        
        {/* Fallback for unknown pages */}
        {!isLoading && !error && !['home', 'bills', 'expenses', 'investment', 'debt', 'savings', 'assumptions', 'income', 'tax', 'retirement', 'networth', 'settings'].includes(currentPage) && (
          <div className="bills-card text-center py-12">
            <div className="text-text-muted italic">Page '{currentPage}' is under construction.</div>
            <button className="bills-btn-small mt-4" onClick={() => setCurrentPage('home')}>Back to Home</button>
          </div>
        )}
      </main>

      {/* Command Center Panel */}
      <AnimatePresence>
        {showCommandPanel && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-bg-main/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 100, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 100, scale: 0.95 }}
              className="bg-bg-card w-full max-w-lg rounded-3xl border border-border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 flex items-center justify-between border-b border-border-subtle shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent-blue rounded-full flex items-center justify-center text-bg-main">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h2 className="font-black">Command Center</h2>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Quick Actions</p>
                  </div>
                </div>
                <button onClick={() => setShowCommandPanel(false)} className="p-2 text-text-muted hover:text-white transition-colors"><X size={20} /></button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-4">
                  {/* Pending Action Review */}
                  {pendingAction ? (
                    <div className="space-y-6">
                      <div className="text-center space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-blue/10 text-accent-blue text-[10px] font-black uppercase tracking-widest">
                          <Settings size={12} className="animate-spin-slow" />
                          Action Required
                        </div>
                        <h3 className="text-lg font-black uppercase">Review & Execute</h3>
                        <p className="text-xs text-text-muted">Verify the details below, then Prosecute.</p>
                      </div>

                      <div className="space-y-4">
                        {pendingAction.calls.map((call, idx) => (
                          <div key={idx} className="bg-white/5 rounded-2xl p-5 border border-white/10 shadow-inner">
                            <div className="flex items-center gap-2 mb-4">
                              <div className="w-2 h-2 rounded-full bg-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                              <div className="text-xs font-black text-white uppercase tracking-wider">
                                {call.name === 'toggleBillStatus' ? `Pay ${call.args.name}` :
                                 call.name === 'deleteBill' ? `Delete ${call.args.name}` :
                                 call.name.replace(/([A-Z])/g, ' $1')}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                              {Object.entries(call.args)
                                .filter(([key]) => key !== 'paid')
                                .sort(([keyA], [keyB]) => {
                                  const order = { name: 1, account: 1, amount: 2, date: 3 };
                                  const valA = order[keyA as keyof typeof order] || 99;
                                  const valB = order[keyB as keyof typeof order] || 99;
                                  if (valA !== valB) return valA - valB;
                                  return keyA.localeCompare(keyB);
                                })
                                .map(([key, val]) => (
                                <div key={key} className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-text-muted uppercase px-1 tracking-wider">{key}</label>
                                  <div className="relative group">
                                    {key.toLowerCase().includes('amount') ? (
                                      <>
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-accent-blue font-black text-xs group-focus-within:text-white transition-colors">$</span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={typeof val === 'string' ? val : Number(val).toFixed(2)}
                                          onChange={(e) => {
                                            const raw = e.target.value;
                                            if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
                                              const newCalls = [...pendingAction.calls];
                                              newCalls[idx] = { ...newCalls[idx], args: { ...newCalls[idx].args, [key]: raw } };
                                              setPendingAction({ calls: newCalls });
                                            }
                                          }}
                                          onBlur={(e) => {
                                            const parsed = parseFloat(e.target.value) || 0;
                                            const newCalls = [...pendingAction.calls];
                                            newCalls[idx] = { ...newCalls[idx], args: { ...newCalls[idx].args, [key]: parsed } };
                                            setPendingAction({ calls: newCalls });
                                          }}
                                          className="w-full bg-black/40 border border-white/10 rounded-xl pl-7 pr-3 py-2.5 text-xs font-black text-accent-blue focus:border-accent-blue focus:bg-black/60 outline-none transition-all"
                                        />
                                      </>
                                    ) : key.toLowerCase().includes('date') ? (
                                      <input
                                        type="date"
                                        value={val as string}
                                        onChange={(e) => {
                                          const newCalls = [...pendingAction.calls];
                                          newCalls[idx] = { ...newCalls[idx], args: { ...newCalls[idx].args, [key]: e.target.value } };
                                          setPendingAction({ calls: newCalls });
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-black text-accent-blue focus:border-accent-blue focus:bg-black/60 outline-none transition-all"
                                      />
                                    ) : (
                                      <input
                                        type="text"
                                        value={val as string}
                                        onChange={(e) => {
                                          const newCalls = [...pendingAction.calls];
                                          newCalls[idx] = { ...newCalls[idx], args: { ...newCalls[idx].args, [key]: e.target.value } };
                                          setPendingAction({ calls: newCalls });
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-black text-accent-blue focus:border-accent-blue focus:bg-black/60 outline-none transition-all"
                                      />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={handleRejectAction}
                          className="flex-1 py-4 rounded-2xl border border-border-subtle text-text-muted font-black text-xs uppercase hover:bg-white/5 transition-all active:scale-95"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleApproveAction}
                          className="flex-[2] py-4 rounded-2xl bg-accent-blue text-white font-black text-xs uppercase hover:bg-accent-blue-dark transition-all active:scale-95 shadow-lg shadow-accent-blue/30 flex items-center justify-center gap-2"
                        >
                          <Check size={18} />
                          Prosecute
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Command History */}
                      {commandHistory.length > 0 ? (
                        <div className="space-y-2">
                          {commandHistory.slice(-8).map((entry, idx) => (
                            <div key={idx} className="space-y-1">
                              {entry.input && (
                                <div className="text-xs font-mono text-text-muted px-1">{'>'} {entry.input}</div>
                              )}
                              <div className={`text-xs font-black px-3 py-2 rounded-xl ${entry.success ? 'bg-accent-green/10 text-accent-green' : 'bg-white/5 text-text-muted'}`}>
                                {entry.result.split("\n").map((line, i) => <div key={i}>{line}</div>)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
                          <div className="space-y-4">
                            <div className="w-16 h-16 mx-auto bg-accent-blue/10 rounded-full flex items-center justify-center text-accent-blue">
                              <MessageSquare size={32} />
                            </div>
                            <div className="space-y-2">
                              <p className="text-lg font-black uppercase tracking-tight">Command Center</p>
                              <p className="text-xs text-text-muted max-w-[240px] mx-auto leading-relaxed">
                                Type commands to manage your finances. Try:
                              </p>
                              <div className="space-y-1.5 text-left max-w-[260px] mx-auto">
                                {[
                                  'pay mortgage',
                                  'balance 15000',
                                  'tsp 47000',
                                  'income usaf 3500',
                                  'debt amex 500',
                                ].map(cmd => (
                                  <button
                                    key={cmd}
                                    onClick={() => { setCommandInput(cmd); commandInputRef.current?.focus(); }}
                                    className="block w-full text-left px-3 py-1.5 rounded-lg bg-white/5 text-[11px] font-mono text-accent-blue hover:bg-white/10 transition-colors"
                                  >
                                    {cmd}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Command Input */}
              <div className="p-4 bg-bg-main/50 border-t border-border-subtle shrink-0">
                <form onSubmit={(e) => { e.preventDefault(); if (commandInput.trim()) { executeCommand(commandInput); setCommandInput(''); } }} className="flex gap-2">
                  <input
                    ref={commandInputRef}
                    autoFocus
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="pay mortgage, balance 15000, tsp 47000..."
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder:text-text-muted/50 focus:border-accent-blue focus:bg-black/60 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    className="w-12 h-12 bg-accent-blue rounded-xl flex items-center justify-center text-bg-main shadow-lg shadow-accent-blue/20 active:scale-95 transition-transform"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
