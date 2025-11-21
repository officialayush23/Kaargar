import React from 'react'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import U_login from '../../pages/U_login'



const TabUW = () => {
    return (
           <div className="flex min-h-screen w-full flex-col transition-all duration-300 items-center justify-center p-4">

           
                    <U_login />
             


        </div>
    )
}

export default TabUW
