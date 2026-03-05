import { useState } from 'react'
import {
  PageHeader,
  ProjectCard,
  NewProjectCard,
  ActivityListItem,
} from '../components/common'
import { mockProjects, mockActivities, slugify } from '../libs/data/home'

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('all')

  return (
    <main className="flex-1 overflow-auto px-6 py-8">
      <PageHeader
        title="Project Management"
        action={{ label: 'Create New Project' }}
        tabs={[
          { value: 'all', label: 'All Projects' },
          { value: 'favorites', label: 'Favorites' },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <section className="mb-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              href={`/project/${slugify(project.name)}`}
            />
          ))}
          <NewProjectCard />
        </div>
      </section>

      <section>
        <h2 className="text-h2 mb-4">Recent Activity</h2>
        <ul className="divide-y divide-neutral-100 bg-white">
          {mockActivities.map((activity) => (
            <ActivityListItem
              key={activity.id}
              message={activity.message}
              apiPath={activity.apiPath}
              timeAgo={activity.timeAgo}
            />
          ))}
        </ul>
      </section>
    </main>
  )
}
