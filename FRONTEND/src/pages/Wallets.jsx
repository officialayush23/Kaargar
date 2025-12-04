import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import {
    Wallet as WalletIcon, ArrowUpRight, ArrowDownLeft,
    Clock, Loader2, Lock, History, TrendingUp, ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { API_BASE_URL } from "../config";
import Headback from "../components/Headback";
import { toast } from "sonner";

export default function Wallet() {
    const navigate = useNavigate();
    const [wallet, setWallet] = useState({ balance_cents: 0, escrow_cents: 0 });
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) { navigate("/login"); return; }
                const token = session.access_token;

                // Fetch Wallet Balance
                const resWallet = await fetch(`${API_BASE_URL}/api/wallet`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                // Fetch Transactions
                const resTx = await fetch(`${API_BASE_URL}/api/wallet/transactions`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                if (resWallet.ok && resTx.ok) {
                    const walletData = await resWallet.json();
                    const txData = await resTx.json();

                    setWallet(walletData.data);
                    setTransactions(txData.data);
                } else {
                    toast.error("Failed to load wallet data");
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [navigate]);

    const formatCurrency = (cents) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(cents / 100);
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
    );

    return (
        <div className="h-screen text-slate-100 font-sans flex flex-col">
            <Headback />

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto pb-12">
                <div className="max-w-3xl mx-auto px-4 pt-6 space-y-8">

                    <Button variant="ghost" size="icon" onClick={() => navigate("/home")} className="text-slate-400 hover:text-white hover:bg-white/10 -ml-3 rounded-full">
                        <ArrowLeft className="w-6 h-6" />
                    </Button>


                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-white">Wallet</h1>
                            <p className="text-slate-400 text-sm">Manage your earnings and payments</p>
                        </div>
                        <div className="bg-blue-600/10 p-3 rounded-full border border-blue-500/20">
                            <WalletIcon className="w-6 h-6 text-blue-500" />
                        </div>
                    </div>

                    {/* Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Available Balance */}
                        <Card className="bg-gradient-to-br from-blue-600/20 to-blue-900/20 border-blue-500/30 backdrop-blur-xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-blue-300 uppercase tracking-wider flex items-center gap-2">
                                    <WalletIcon className="w-4 h-4" /> Available Balance
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold text-white">{formatCurrency(wallet.balance_cents)}</div>
                                <p className="text-xs text-slate-400 mt-1">Ready to withdraw or spend</p>
                            </CardContent>
                        </Card>

                        {/* Escrow / Locked */}
                        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-amber-400 uppercase tracking-wider flex items-center gap-2">
                                    <Lock className="w-4 h-4" /> Locked in Escrow
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-4xl font-bold text-slate-200">{formatCurrency(wallet.escrow_cents)}</div>
                                <p className="text-xs text-slate-500 mt-1">Funds held for ongoing jobs</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Transactions */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <History className="w-5 h-5 text-slate-400" /> Transaction History
                        </h2>

                        <Card className="bg-white/5 border-white/10">
                            <CardContent className="p-0">
                                <ScrollArea className="max-h-[60vh]">
                                    {transactions.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                                            <History className="w-8 h-8 mb-2 opacity-50" />
                                            <p>No transactions yet</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-white/5">
                                            {transactions.map((tx) => (
                                                <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`p-2 rounded-full ${tx.amount_cents > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                                                            {tx.amount_cents > 0 ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                                                        </div>
                                                        <div>
                                                            <p className="text-white font-medium text-sm">{tx.description || "Transaction"}</p>
                                                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" /> {new Date(tx.created_at).toLocaleDateString()} at {new Date(tx.created_at).toLocaleTimeString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className={`text-right font-mono font-bold ${tx.amount_cents > 0 ? "text-emerald-400" : "text-slate-300"}`}>
                                                        {tx.amount_cents > 0 ? "+" : ""}{formatCurrency(tx.amount_cents)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>
                    </div>

                </div>
            </div>
        </div>
    );
}






