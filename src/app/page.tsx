"use client";

// React
import { useState } from "react";

//Component
import Header from "@/components/shared/Header";
import ProjectsList from "@/components/main/ProjectList";
import ProjectTab from "@/components/main/ProjectTab";
import HistoryList from "@/components/main/HistoryList";
// import HistoryTable from "@/components/main/HistoryTable";

export default function HomePage() {
  return (
    <>
      <Header variant="main" title="Project Management" onCreateProject={() => {}} />

      <div className="mx-auto w-full max-w-[1600px] px-6">
        <div className="mt-8 mb-8">
          {/* Tab 영역 */}
          <ProjectTab />
          {/* 카드 영역 */}
          <div className="">
            <ProjectsList folderId="id" />
            <HistoryList folderId={""} />
          </div>
        </div>
      </div>
      {/* <section className="mb-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockProjects.map((project) => (
            <ProjectCard key={project.id} project={project} href={`/project/${slugify(project.name)}`} />
          ))}
          <NewProjectCard />
        </div>
      </section>
      <section>
        <h2 className="typo-heading-1 mb-4">Recent Activity</h2>
        <ul className="divide-y divide-gray-100 bg-background-white">
          {mockActivities.map((activity) => (
            <ActivityListItem
              key={activity.id}
              message={activity.message}
              apiPath={activity.apiPath}
              timeAgo={activity.timeAgo}
            />
          ))}
        </ul>
      </section> */}
    </>
  );
}
