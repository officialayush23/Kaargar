import React from 'react'
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
           <div className="flex min-h-screen w-full flex-col transition-all duration-300 items-center justify-center p-4">
            <Tabs defaultValue="account">
                <TabsList className="bg-transparent backdrop-blur-4xl">
                    <TabsTrigger value="account"><h2 className='text-2xl'>Hire</h2></TabsTrigger>
                    <TabsTrigger value="password"><h2 className='text-2xl'>Work</h2></TabsTrigger>
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
