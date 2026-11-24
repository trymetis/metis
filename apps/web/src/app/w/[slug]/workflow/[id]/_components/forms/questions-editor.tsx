"use client";

import { Button } from "@metis/ui/components/button";
import { FieldDescription } from "@metis/ui/components/field";
import { Plus } from "lucide-react";

import { nodeQuestions } from "@/workflow/decision";
import { type Binding, literal } from "@/workflow/expr";
import type { DecisionQuestion, GraphNode } from "@/workflow/schema";

import { useDockActions } from "../editor-context";
import { jsonOf } from "./json";
import { newQuestion, nextId, QUESTION_TYPE_OPTIONS, QuestionEditor } from "./question-editor";

export function QuestionsEditor({
  node,
  onChange,
}: {
  node: GraphNode;
  onChange: (next: Binding | undefined) => void;
}) {
  const questions = nodeQuestions(node);
  const { openPreview } = useDockActions();
  const set = (next: DecisionQuestion[]) => onChange(literal(jsonOf(next)));

  return (
    <div className="flex flex-col gap-2">
      {questions.length === 0 && (
        <FieldDescription>
          Add a question. All of them are asked in one call per item.
        </FieldDescription>
      )}
      {questions.map((question, index) => (
        <QuestionEditor
          key={question.id}
          question={question}
          index={index}
          onChange={(next) => set(questions.map((q) => (q.id === next.id ? next : q)))}
          onRemove={() => set(questions.filter((q) => q.id !== question.id))}
        />
      ))}
      <div className="flex gap-1.5">
        {QUESTION_TYPE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            size="sm"
            className="flex-1 border-dashed"
            onClick={() =>
              set([
                ...questions,
                newQuestion(
                  option.value,
                  nextId(
                    "q",
                    questions.map((q) => q.id),
                    1,
                  ),
                ),
              ])
            }
          >
            <Plus /> {option.label}
          </Button>
        ))}
      </div>
      <FieldDescription>
        Phrase each question positively, state the whole rule and its tie-breaks, and keep answers
        few and distinct.
      </FieldDescription>
      <Button
        variant="outline"
        disabled={questions.length === 0}
        onClick={() => openPreview(node.id)}
      >
        Try on recent mail
      </Button>
    </div>
  );
}
