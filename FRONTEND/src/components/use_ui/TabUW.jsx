import React from 'react'

import { AppWindowIcon, CodeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import U_login from '../../pages/U_login'
import W_login from '../../pages/W_login'


const TabUW = () => {
    return (
        <div>
            <Tabs defaultValue="account">
                <TabsList>
                    <TabsTrigger value="account">Account</TabsTrigger>
                    <TabsTrigger value="password">Password</TabsTrigger>
                </TabsList>
                <TabsContent value="account">
                    <U_login />
                </TabsContent>
                <TabsContent value="password">
                    <W_login/>

                </TabsContent>
            </Tabs>

        </div>
    )
}

export default TabUW
