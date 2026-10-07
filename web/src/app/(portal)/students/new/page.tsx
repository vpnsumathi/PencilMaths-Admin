import Link from 'next/link';
import { Alerts } from '@/components/Alerts';
import ui from '@/components/ui.module.css';
import { loadStudentFormOptions, StudentForm } from '../StudentForm';

export const metadata = { title: 'Add student' };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function NewStudentPage({ searchParams }: Props) {
  const { error: problem } = await searchParams;
  const options = await loadStudentFormOptions();

  return (
    <>
      <Link href="/students" className={ui.back}>← All students</Link>
      <div className={ui.header}><h1 className={ui.title}>Add student</h1></div>
      <Alerts problem={problem} />
      <StudentForm options={options} />
    </>
  );
}
